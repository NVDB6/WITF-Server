from azure.cognitiveservices.vision.customvision.prediction import CustomVisionPredictionClient
from msrest.authentication import ApiKeyCredentials

# Replace with valid values
ENDPOINT = "https://nvdfridge-prediction.cognitiveservices.azure.com/"
prediction_key = "6fd3b87d799d4c1592ec16541ff510ef"
project_id = "9cbf7b7d-2aaf-4bd9-a24e-9ded611d4784"
publish_iteration_name = "Iteration3"

prediction_credentials = ApiKeyCredentials(in_headers={"Prediction-key": prediction_key})
predictor = CustomVisionPredictionClient(ENDPOINT, prediction_credentials)

# Now there is a trained endpoint that can be used to make a prediction
prediction_credentials = ApiKeyCredentials(in_headers={"Prediction-key": prediction_key})
predictor = CustomVisionPredictionClient(ENDPOINT, prediction_credentials)

with open("../resources/upload_images/frame_1678058598_d8a97ce7_IN.png", "rb") as image_contents:
    results = predictor.classify_image(
        project_id, publish_iteration_name, image_contents.read())

    # Display the results.
    for prediction in results.predictions:
        print("\t" + prediction.tag_name +
              ": {0:.2f}%".format(prediction.probability * 100))