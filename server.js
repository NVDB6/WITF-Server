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

  if (itemInHandIntoFridge === itemInHandOutOfFridge) {
    console.error(
      "Both stages of item going into fridge and out of fridge: ",
      itemInHandIntoFridge
    );
    res.status(500).send();
  } else if (itemInHandIntoFridge) {
  }
  // const inHandPreds = await Promise.all(
  //   files.map((file) => ({
  //     in_out: file.fieldname.split(/[_/.]+/)[3], // "IN" or "OUT"
  //     in_hand_pred: predictor.classifyImage(
  //       projectID,
  //       publishIterationName,
  //       file.buffer
  //     ),
  //   }))
  // );

  // // let handIntoFridge = [];
  // // let handOutOfFridge = [];
  // inHandPreds.forEach(({ in_out }, i) => {
  //   switch (in_out) {
  //     case "IN":
  //       handIntoFridge.push(inHandPreds[i]);
  //       break;
  //     case "OUT":
  //       handOutOfFridge.push();
  //   }
  // });
  // console.log(files[0].fieldname.split(/[_/.]+/));

  // // results key: "IN" or "OUT"
  // const results = {};
  // await Promise.all(
  //   files.map(async (file) => {
  //     results[file.fieldname.split(/[_/.]+/)[3]] = {
  //       time: file.fieldname.split(/[_/.]+/)[1], // Milliseconds
  //       in_hand_pred: await predictor.classifyImage(
  //         projectID,
  //         publishIterationName,
  //         file.buffer
  //       ),
  //       food_pred: await predictor.classifyImage(
  //         projectID,
  //         publishIterationName,
  //         file.buffer
  //       ),
  //     };
  //   })
  // );

  // // Show results
  // // TODO: Change the expected labels to
  // if (
  //   results.IN.in_hand_pred.predictions[0] === "item_in_hand" &&
  //   results.OUT.in_hand_pred.predictions[0] === "item_not_in_hand"
  // )
  //   // item placed in fridge
  //   in_or_out = "IN";
  // else if (
  //   results.IN.in_hand_pred.predictions[0] === "item_not_in_hand" &&
  //   results.OUT.in_hand_pred.predictions[0] === "item_in_hand"
  // )
  //   in_or_out = "IN";
  // else res.status(500);
  // top_preds = {};
  // results.forEach(({ name, in_hand_pred, food_pred }) => {
  //   // if ()
  //   top_preds[name] = {
  //     in_hand_pred: in_hand_pred.predictions[0],
  //     food_pred: food_pred.predictions[0],
  //   };
  // });

  res.send("Upload images\n");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
