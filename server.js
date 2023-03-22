const express = require("express");
const multer = require("multer");
const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");
const msRest = require("@azure/ms-rest-js");
const app = express();
const upload = multer();
const port = 3000;

const predEndpoint =
  "https://nvdfridge-prediction.cognitiveservices.azure.com/";
const predKey = process.env.PRED_KEY;

const inHandClassifierProjID = "38cfb8e8-1637-4159-bd63-a51a33f010dc";
const inHandClassifierIterName = "Iteration1";

const foodClassifierProjID = "9cbf7b7d-2aaf-4bd9-a24e-9ded611d4784";
const foodClassifierIterName = "Iteration3";

const predictorCreds = new msRest.ApiKeyCredentials({
  inHeader: { "Prediction-key": predKey },
});
const predictor = new PredictionApi.PredictionAPIClient(
  predictorCreds,
  predEndpoint
);
const FRAMES_PER_ACTION = 5;

const db = [];
const dbHeaders = ["time", "item", "in or out"];

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Classifies if there is an item in hand when the hand is going in the fridge, and out of the fridge
// A value of true in the return value indicates
const itemInHand = (itemInHandPreds) => {
  let predValues = { Empty: [], "Non-empty": [] };
  itemInHandPreds.forEach((framePred) =>
    framePred.predictions.forEach((pred) =>
      predValues[pred.tagName].push(pred.probability)
    )
  );
  let maxPredValues = { Empty: 0, "Non-empty": 0 };
  Object.keys(maxPredValues).forEach(
    (key) => (maxPredValues[key] = Math.max(...predValues[key]))
  );
  return maxPredValues["Non-empty"] > maxPredValues["Empty"];
};

app.post("/upload-images", upload.any(), async (req, res) => {
  const files = req.files;
  console.assert(
    files.length === FRAMES_PER_ACTION * 2,
    `Invalid number of images passed to the upload-images endpoint: expected 2, got ${files.length}`
  );
  const { IN: handIntoFridge, OUT: handOutOfFridge } = files.reduce(
    (result, element) => {
      result[element.fieldname.split(/[_/.]+/)[3]].push(element.buffer);
      return result;
    },
    { IN: [], OUT: [] }
  );

  const itemInHandPreds = await Promise.all(
    [...handIntoFridge, ...handOutOfFridge].map((buf) =>
      predictor.classifyImage(
        inHandClassifierProjID,
        inHandClassifierIterName,
        buf
      )
    )
  );

  const itemInHandIntoFridge = itemInHand(
    itemInHandPreds.slice(0, FRAMES_PER_ACTION)
  );
  const itemInHandOutOfFridge = itemInHand(
    itemInHandPreds.slice(FRAMES_PER_ACTION, -1)
  );
  console.log("Item in hand for IN stage: ", itemInHandIntoFridge);
  console.log("Item in hand for OUT stage: ", itemInHandOutOfFridge);

  if (itemInHandIntoFridge === itemInHandOutOfFridge)
    return res
      .status(500)
      .send(
        `ERROR: Both stages of item going into fridge and out of fridge: ${itemInHandIntoFridge}`
      );

  const time = new Date(
    parseInt(files[0].fieldname.split(/[_/.]+/)[1]) * 1000
  ).toISOString();
  console.log(time);

  // Classify the food item in hand
  const foodFrames = itemInHandIntoFridge ? handIntoFridge : handOutOfFridge;
  const foodPreds = await Promise.all(
    foodFrames.map((buf) =>
      predictor.classifyImage(foodClassifierProjID, foodClassifierIterName, buf)
    )
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

  res.send(
    `${maxFoodPred.tagName} ${
      itemInHandIntoFridge ? "placed in" : "taken out of"
    } fridge with probability ${maxFoodPred.probability}`
  );
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
