const express = require("express");
const multer = require("multer");
const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");
const msRest = require("@azure/ms-rest-js");
const app = express();
const upload = multer();
const port = 3000;

const predictionKey = "629384e7f083433ca30fa5113c4cf44e";
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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/upload-images", upload.any(), async (req, res) => {
  const files = req.files;

  const results = await Promise.all(
    files.map((file) =>
      predictor.classifyImage(projectID, publishIterationName, file.buffer)
    )
  );

  // Show results
  results.forEach((result) =>
    result.predictions.forEach((predictedResult) => {
      console.log(
        `\t ${predictedResult.tagName}: ${(
          predictedResult.probability * 100.0
        ).toFixed(2)}%`
      );
    })
  );

  res.send("Upload images\n");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
