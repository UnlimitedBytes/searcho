const { evaluate } = require('mathjs');
const logger = require('../logger');

async function calculate(expression) {
  logger.info(`Evaluating expression: "${expression}"`);
  try {
    // Evaluate the expression safely
    const result = evaluate(expression);
    return String(result);
  } catch (error) {
    logger.error(`Calculation failed: ${error.message}`);
    return `Error evaluating expression: ${error.message}`;
  }
}

module.exports = { calculate };
