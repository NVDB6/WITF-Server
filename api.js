const { logger } = require('./server_helpers')

const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");
const msRest = require("@azure/ms-rest-js");

const predEndpoint = "https://nvdfridge-prediction.cognitiveservices.azure.com/";
const predKey = process.env.PRED_KEY;

const inHandClassifierProjID = "38cfb8e8-1637-4159-bd63-a51a33f010dc";
const inHandClassifierIterName = "Iteration4";

const foodClassifierProjID = "9cbf7b7d-2aaf-4bd9-a24e-9ded611d4784";
const foodClassifierIterName = "Iteration9";

const predictorCreds = new msRest.ApiKeyCredentials({
    inHeader: { "Prediction-key": predKey },
});

const predictor = new PredictionApi.PredictionAPIClient(
    predictorCreds,
    predEndpoint
);

const predictIIH = async (inFrames, outFrames, actionUid) => {
    let iihClassifyTimeInSeconds = performance.now();
    try {
        return itemInHandPreds = await Promise.all(
            [...inFrames, ...outFrames].map((buf) =>
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
    } finally {
        iihClassifyTimeInSeconds = ((performance.now() - iihClassifyTimeInSeconds) / 1000).toFixed(3);
        logger.info(
            `[PERFORMANCE][IIH][UID:${actionUid}] IIH Classify Time: ${iihClassifyTimeInSeconds} seconds`
        );
    }
}

const predictFood = async (foodFrames, actionUid) => {
    let foodClassifyTimeInSeconds = performance.now();
    try {
        return foodPreds = await Promise.all(
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
    } finally {
        foodClassifyTimeInSeconds = (
            (performance.now() - foodClassifyTimeInSeconds) /
            1000
        ).toFixed(3);
        logger.info(
            `[PERFORMANCE][FOOD][UID:${actionUid}] Food Classify Time: ${foodClassifyTimeInSeconds} seconds`
        );
    }
}
module.exports = {
    predictIIH,
    predictFood
};