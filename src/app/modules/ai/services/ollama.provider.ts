export enum AIIntent {ORDER_STATUS='ORDER_STATUS',PRODUCT_INQUIRY='PRODUCT_INQUIRY',GENERAL_CHAT='GENERAL_CHAT',COMPLAINT='COMPLAINT',UNKNOWN='UNKNOWN'}
export class OllamaProvider {
 async generateResponse(prompt:string,systemPrompt=''):Promise<string> {
  try {
   const response=await fetch(`${process.env.OLLAMA_API_URL || 'http://localhost:11434'}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:process.env.OLLAMA_MODEL || 'llama3.2',prompt,system:systemPrompt,stream:false,format:'json',options:{temperature:0}})});
   if(!response.ok)throw new Error();const data=await response.json();if(typeof data.response!=='string'||!data.response.trim())throw new Error();return data.response;
  } catch {throw new Error('AI provider unavailable');}
 }
}
export const ollamaProvider=new OllamaProvider();
