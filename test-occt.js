import initOpenCascade from "occt-import-js";

initOpenCascade().then(occt => {
  console.log("OCCT keys:", Object.keys(occt));
  if (occt.FS) {
    console.log("FS is available");
  } else {
    console.log("FS is missing");
  }
}).catch(console.error);
