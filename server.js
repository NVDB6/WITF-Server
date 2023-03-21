const express = require("express");
const multer = require("multer");
const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");
const msRest = require("@azure/ms-rest-js");
const { PREDICTION_KEY } = require("./secrets");
const app = express();
const upload = multer();
const port = 3000;

const predictionKey = PREDICTION_KEY;
const projectID = "9cbf7b7d-2aaf-4bd9-a24e-9ded611d4784";
const predictionEndpoint =
  "https://nvdfridge-prediction.cognitiveservices.azure.com/";
const publishIterationName = "Iteration3";

const predictor_credentials = new msRest.ApiKeyCredentials({
  inHeader: { "Prediction-key": predictionKey },
});
const predictor = new PredictionApi.PredictionAPIClient(
  predictor_credentials,
  predictionEndpoint
);

db = [];
db_headers = ["time", "item", "in or out", "expiration"];

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/upload-images", upload.any(), async (req, res) => {
  const files = req.files;
  console.assert(
    files.length === 2,
    `Invalid number of images passed to the upload-images endpoint: expected 2, got ${files.length}`
  );
  console.log(files[0].fieldname.split(/[_/.]+/));

  // results key: "IN" or "OUT"
  const results = {};
  await Promise.all(
    files.map(async (file) => {
      results[file.fieldname.split(/[_/.]+/)[3]] = {
        time: file.fieldname.split(/[_/.]+/)[1], // Milliseconds
        in_hand_pred: await predictor.classifyImage(
          projectID,
          publishIterationName,
          file.buffer
        ),
        food_pred: await predictor.classifyImage(
          projectID,
          publishIterationName,
          file.buffer
        ),
      };
    })
  );

  // Show results
  // TODO: Change the expected labels to
  if (
    results.IN.in_hand_pred.predictions[0] === "item_in_hand" &&
    results.OUT.in_hand_pred.predictions[0] === "item_not_in_hand"
  )
    // item placed in fridge
    in_or_out = "IN";
  else if (
    results.IN.in_hand_pred.predictions[0] === "item_not_in_hand" &&
    results.OUT.in_hand_pred.predictions[0] === "item_in_hand"
  )
    in_or_out = "IN";
  else res.status(500);
  top_preds = {};
  results.forEach(({ name, in_hand_pred, food_pred }) => {
    // if ()
    top_preds[name] = {
      in_hand_pred: in_hand_pred.predictions[0],
      food_pred: food_pred.predictions[0],
    };
  });

  res.send("Upload images\n");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
