const { getQuickJS } = require("quickjs-emscripten");
const logger = require('../logger');

async function runScript(code) {
  logger.info("Executing sandboxed JavaScript code");
  try {
    const QuickJS = await getQuickJS();
    const vm = QuickJS.createVm();

    // Define a console.log function inside the VM to capture output
    const logs = [];
    const logHandle = vm.newFunction("log", (...args) => {
      const nativeArgs = args.map(vm.dump);
      logs.push(nativeArgs.join(" "));
    });

    const consoleHandle = vm.newObject();
    vm.setProp(consoleHandle, "log", logHandle);
    vm.setProp(vm.global, "console", consoleHandle);

    consoleHandle.dispose();
    logHandle.dispose();

    // Execute the code
    const result = vm.evalCode(code);

    let output;
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(error.message || String(error));
    } else {
      output = vm.dump(result.value);
      result.value.dispose();
    }

    vm.dispose();

    const logOutput = logs.length > 0 ? `Logs:\n${logs.join('\n')}\n` : '';
    const resultOutput = output !== undefined ? `Result: ${JSON.stringify(output)}` : 'Result: undefined';

    return `${logOutput}${resultOutput}`;

  } catch (error) {
    logger.error(`Sandbox execution failed: ${error.message}`);
    return `Error executing code: ${error.message}`;
  }
}

module.exports = { runScript };
