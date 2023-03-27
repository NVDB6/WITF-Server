const express = require("express");
const multer = require("multer");
const log4js = require("log4js");
const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");
const msRest = require("@azure/ms-rest-js");
// const admin = require("firebase-admin");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const serviceAccount = require("./witf-ba054-firebase-adminsdk-g073x-912889a8c9.json");

const app = express();
const upload = multer();
const port = 3000;
const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: "witf-ba054.appspot.com",
});
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// Configure log4js to write to a file called log.txt
log4js.configure({
  appenders: {
    file: { type: "file", filename: "server.log" },
    out: { type: "stdout" },
  },
  categories: {
    default: {
      appenders: ["file", "out"],
      level: "all",
      enableCallStack: true,
    },
  },
});

// Get a logger instance
const logger = log4js.getLogger();

logger.info("Starting server...");

const predEndpoint =
  "https://nvdfridge-prediction.cognitiveservices.azure.com/";
const predKey = process.env.PRED_KEY;

const inHandClassifierProjID = "38cfb8e8-1637-4159-bd63-a51a33f010dc";
const inHandClassifierIterName = "Iteration4";

const foodClassifierProjID = "9cbf7b7d-2aaf-4bd9-a24e-9ded611d4784";
const foodClassifierIterName = "Iteration5";

const predictorCreds = new msRest.ApiKeyCredentials({
  inHeader: { "Prediction-key": predKey },
});
const predictor = new PredictionApi.PredictionAPIClient(
  predictorCreds,
  predEndpoint
);
const FRAMES_PER_ACTION = 5;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Classifies if there is an item in hand when the hand is going in the fridge, and out of the fridge
// A value of true in the return value indicates
const itemInHand = (action_uid, itemInHandPreds) => {
  let predValues = { Empty: [], "Non-empty": [] };
  itemInHandPreds.forEach((framePred) =>
    framePred.predictions.forEach((pred) =>
      predValues[pred.tagName].push(pred.probability)
    )
  );
  logger.debug(`[RESULTS][IIH][UID:${action_uid}] IIH Individual Predictions`, predValues);
  let maxPredValues = { Empty: 0, "Non-empty": 0 };
  Object.keys(maxPredValues).forEach(
    (key) => (maxPredValues[key] = Math.max(...predValues[key]))
  );
  logger.info(`[RESULTS][IIH][UID:${action_uid}] IIH Max Predictions`, maxPredValues);
  return maxPredValues["Non-empty"] > maxPredValues["Empty"];
};

app.post("/upload-images", upload.any(), async (req, res) => {
  const files = req.files;

  if (files.length !== FRAMES_PER_ACTION * 2) {
    const errMsg = `Invalid number of images passed to the upload-images endpoint: expected ${FRAMES_PER_ACTION * 2
      }, got ${files.length}`;
    logger.error(errMsg);
    return res.status(500).send(errMsg);
  }

  const { IN: handIntoFridge, OUT: handOutOfFridge } = files.reduce(
    (result, element) => {
      logger.debug(`[RECIEVING IMAGES]: ${element.originalname}`);
      result[element.originalname.split("_")[3]].push(element.buffer);
      return result;
    },
    { IN: [], OUT: [] }
  );

  const action_uid = files[0].originalname.split("_")[2]

  if (
    handIntoFridge.length !== FRAMES_PER_ACTION ||
    handOutOfFridge.length !== FRAMES_PER_ACTION
  ) {
    const errMsg = `Invalid number of images passed to the upload-images endpoint: expected ${FRAMES_PER_ACTION} of each, got Into-Fridge: ${handIntoFridge.length}, Out-Of-Fridge: ${handIntoFridge.length}`;
    logger.error(errMsg);
    return res.status(500).send(errMsg);
  }

  let itemInHandPreds;
  let iihClassifyTimeInSeconds = performance.now()
  try {
    itemInHandPreds = await Promise.all(
      [...handIntoFridge, ...handOutOfFridge].map((buf) =>
        predictor.classifyImage(
          inHandClassifierProjID,
          inHandClassifierIterName,
          buf
        )
      )
    );
  } catch (error) {
    logger.error("Azure prediction failed: ", error.message);
    return res.status(500).send(error.message);
  }
  iihClassifyTimeInSeconds = ((performance.now() - iihClassifyTimeInSeconds) / 1000).toFixed(3);
  logger.info(`[PERFORMANCE][IIH][UID:${action_uid}] IIH Classify Time: ${iihClassifyTimeInSeconds} seconds`);

  const itemInHandIntoFridge = itemInHand(action_uid,
    itemInHandPreds.slice(0, FRAMES_PER_ACTION)
  );
  const itemInHandOutOfFridge = itemInHand(action_uid,
    itemInHandPreds.slice(FRAMES_PER_ACTION, -1)
  );

  logger.info(
    `[RESULTS][IIH][UID:${action_uid}][FINAL] Item in hand going in: ${itemInHandIntoFridge} ||| Item in hand going out: ${itemInHandOutOfFridge}`
  );

  if (itemInHandIntoFridge === itemInHandOutOfFridge) {
    logger.error(
      `[ERROR][IIH][UID:${action_uid}] IIH Classification is the same for both actions: ${itemInHandIntoFridge}`
    );
    return res
      .status(500)
      .send(
        `ERROR: Both stages of item going into fridge and out of fridge: ${itemInHandIntoFridge}`
      );
  }

  const time = new Date(parseInt(files[0].originalname.split("_")[1]) * 1000);
  const representativeImage = itemInHandIntoFridge
    ? handIntoFridge[FRAMES_PER_ACTION - 1]
    : handOutOfFridge[0];

  let expireTime = new Date();
  expireTime.setDate(expireTime.getDate() + 7);

  let url;
  try {
    await storage
      .bucket()
      .file(`${time.getTime().toString()}.png`)
      .save(representativeImage);
    const urls = await storage
      .bucket()
      .file(`${time.getTime().toString()}.png`)
      .getSignedUrl({ action: "read", expires: expireTime });
    url = urls[0];
  } catch (error) {
    logger.error("Firebase image upload failed: ", error.message);
    return res.status(500).send(error.message);
  }

  // Classify the food item in hand
  const foodFrames = itemInHandIntoFridge ? handIntoFridge : handOutOfFridge;
  let foodPreds;
  let foodClassifyTimeInSeconds = performance.now()
  try {
    foodPreds = await Promise.all(
      foodFrames.map((buf) =>
        predictor.classifyImage(
          foodClassifierProjID,
          foodClassifierIterName,
          buf
        )
      )
    );
  } catch (error) {
    logger.error("Azure prediction failed: ", error.message);
    return res.status(500).send(error.message);
  }
  foodClassifyTimeInSeconds = ((performance.now() - foodClassifyTimeInSeconds) / 1000).toFixed(3);
  logger.info(`[PERFORMANCE][FOOD][UID:${action_uid}] Food Classify Time: ${foodClassifyTimeInSeconds} seconds`);

  foodPreds.forEach((foodPred) =>
    logger.info(`[RESULTS][FOOD][UID:${action_uid}] Food Predictions`, foodPred.predictions)
  );
  const maxFoodPred = foodPreds.reduce(
    (prev, current) =>
      current.predictions[0].probability > prev.probability
        ? {
          probability: current.predictions[0].probability,
          tagName: current.predictions[0].tagName,
        }
        : prev,
    { probability: 0, tagName: "" }
  );

  logger.info(
    `[RESULTS][UID:${action_uid}][FINAL] ${maxFoodPred.tagName} ${itemInHandIntoFridge ? "placed in" : "taken out of"
    } fridge at ${time.toISOString()}`
  );

  const docRef = db.collection("fridge-items").doc(time.getTime().toString());

  try {
    await docRef.set({
      timeAction: time,
      itemName: maxFoodPred.tagName,
      intoFridge: itemInHandIntoFridge,
      imageUrl: url,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }

  res.send(
    `${maxFoodPred.tagName} ${itemInHandIntoFridge ? "placed in" : "taken out of"
    } fridge with probability ${maxFoodPred.probability}`
  );
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
