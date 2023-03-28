log4js = require('log4js');

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

const logger = log4js.getLogger();

const receiveImages = (files) => {
    const { IN: handIntoFridge, OUT: handOutOfFridge } = files.reduce(
        (result, element) => {
            logger.debug(`[RECIEVING IMAGES]: ${element.originalname}`);
            result[element.originalname.split("_")[3]].push(element.buffer);
            return result;
        },
        { IN: [], OUT: [] }
    );
    return { handIntoFridge, handOutOfFridge };
}

const getActionUid = (file) => {
    return file.originalname.split("_")[2];
}

// Classifies if there is an item in hand when the hand is going in the fridge, and out of the fridge
// A value of true in the return value indicates
const isItemInHand = (action_uid, itemInHandPreds) => {
    let predValues = { Empty: [], "Non-empty": [] };
    itemInHandPreds.forEach((framePred) =>
        framePred.predictions.forEach((pred) =>
            predValues[pred.tagName].push(pred.probability)
        )
    );
    logger.debug(
        `[RESULTS][IIH][UID:${action_uid}] IIH Individual Predictions`,
        predValues
    );
    let maxPredValues = { Empty: 0, "Non-empty": 0 };
    Object.keys(maxPredValues).forEach(
        (key) => (maxPredValues[key] = Math.max(...predValues[key]))
    );
    logger.info(
        `[RESULTS][IIH][UID:${action_uid}] IIH Max Predictions`,
        maxPredValues
    );

    return maxPredValues["Non-empty"] > maxPredValues["Empty"] ? [true, maxPredValues["Non-empty"]] : [false, maxPredValues["Empty"]];
};

const getMaxFoodPred = (foodPreds) => {
    return foodPreds.reduce(
        (prev, current) =>
            current.predictions[0].probability > prev.probability
                ? {
                    probability: current.predictions[0].probability,
                    tagName: current.predictions[0].tagName,
                }
                : prev,
        { probability: 0, tagName: "" }
    );
}

module.exports = {
    receiveImages,
    getActionUid,
    logger,
    isItemInHand,
    getMaxFoodPred
}