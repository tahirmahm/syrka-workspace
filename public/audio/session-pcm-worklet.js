// Local microphone PCM capture. No provider keys or network access in this processor.
class SyrkaPcm extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Int16Array(64000);this.position=0;this.sent=0;}
  process(inputs){
    const input=inputs[0]?.[0];if(!input)return true;
    for(const value of input){
      const sample=Math.max(-1,Math.min(1,value));this.buffer[this.position++]=sample<0?sample*32768:sample*32767;
      if(this.position===this.buffer.length){
        const buffer=this.buffer.buffer;this.port.postMessage({buffer,startSample:this.sent,endSample:this.sent+64000},[buffer]);
        this.sent+=64000;this.buffer=new Int16Array(64000);this.position=0;
      }
    }
    return true;
  }
}
registerProcessor('syrka-pcm',SyrkaPcm);
