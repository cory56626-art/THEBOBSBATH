import {verifySimulation} from '../src/verification.js';
const report=await verifySimulation();
console.log(JSON.stringify(report,null,2));
process.exitCode=report.failed?1:0;
