import initOpenCascade from "occt-import-js";

initOpenCascade().then(occt => {
  console.log("ReadStepFile info:", occt.ReadStepFile.toString());
}).catch(console.error);
