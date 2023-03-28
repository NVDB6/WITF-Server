const { receiveImages, getActionUid, logger, isItemInHand, getMaxFoodPred } = require("./server_helpers")
const { predictIIH, predictFood } = require("./api")

const express = require("express");
const multer = require("multer");

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

logger.info("Starting server...");

const FRAMES_PER_ACTION = 3;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/upload-images", upload.any(), async (req, res) => {
  const files = req.files;

  if (files.length !== FRAMES_PER_ACTION * 2) {
    const errMsg = `Invalid number of images passed to the upload-images endpoint: expected ${FRAMES_PER_ACTION * 2}, got ${files.length}`;
    logger.error(errMsg);
    return res.status(500).send(errMsg);
  }

  const { handIntoFridge, handOutOfFridge } = receiveImages(files);
  const action_uid = getActionUid(files[0])

  logger.info(`[RECIEVED IMAGES] For ${action_uid}`);

  if (
    handIntoFridge.length !== FRAMES_PER_ACTION ||
    handOutOfFridge.length !== FRAMES_PER_ACTION
  ) {
    const errMsg = `Invalid number of images passed to the upload-images endpoint: expected ${FRAMES_PER_ACTION} of each, got Into-Fridge: ${handIntoFridge.length}, Out-Of-Fridge: ${handIntoFridge.length}`;
    logger.error(errMsg);
    return res.status(500).send(errMsg);
  }

  const itemInHandPreds = await predictIIH(handIntoFridge, handOutOfFridge, action_uid);

  const [itemInHandIntoFridge, inProb] = isItemInHand(
    action_uid,
    itemInHandPreds.slice(0, FRAMES_PER_ACTION)
  );
  const [itemInHandOutOfFridge, outProb] = isItemInHand(
    action_uid,
    itemInHandPreds.slice(-FRAMES_PER_ACTION)
  );

  logger.info(
    `[RESULTS][IIH][UID: ${action_uid}][FINAL] Item ${itemInHandIntoFridge ? "going into the fridge" : "going out of the fridge"}`
  );

  if (itemInHandIntoFridge === itemInHandOutOfFridge) {
    logger.error(
      `[ERROR][IIH][UID: ${action_uid}] IIH Classification is the same for both actions: ${itemInHandIntoFridge ? "NON-EMPTY" : "EMPTY"}"`
    );
    return res
      .status(500)
      .send(
        `ERROR: Both stages of item going into fridge and out of fridge: ${itemInHandIntoFridge}`
      );
  }

  const iihProb = itemInHandIntoFridge ? inProb : outProb;

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
  const foodPreds = await predictFood(foodFrames, action_uid);

  foodPreds.forEach((foodPred) =>
    logger.info(
      `[RESULTS][FOOD][UID: ${action_uid}] Food Predictions`,
      foodPred.predictions
    )
  );

  const maxFoodPred = getMaxFoodPred(foodPreds);

  logger.info(
    `[RESULTS][UID: ${action_uid}][FINAL] ${maxFoodPred.tagName} ${itemInHandIntoFridge ? "placed in" : "taken out of"
    } fridge at ${time.toISOString()}`
  );

  const docRef = db.collection("fridge-items").doc(time.getTime().toString());

  try {
    await docRef.set({
      timeAction: time,
      itemName: maxFoodPred.tagName,
      foodConfidence: maxFoodPred.probability,
      intoFridge: itemInHandIntoFridge,
      iihConfidence: iihProb,
      imageUrl: url,
      actionUid: action_uid,
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
