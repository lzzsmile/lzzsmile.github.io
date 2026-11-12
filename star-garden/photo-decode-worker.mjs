// A dedicated, one-photo worker can be terminated on cancellation or timeout.
// Pixel decoding stays on this device. No network access or metadata persistence.
self.onmessage=async({data:{file,options}})=>{
  let bitmap;
  try{bitmap=await createImageBitmap(file,options);self.postMessage({bitmap},[bitmap]);}
  catch{bitmap?.close();self.postMessage({error:true});}
};
