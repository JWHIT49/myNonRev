// The script the native in-app browser runs inside each airline page. It is the same engine as the bookmarklet, started directly with
// the credentials (no clipboard and no login code are involved in the native app).
import { runAutofill } from './engine.js';

export function injectionScript(payload) {
  return `(function(){try{(${runAutofill.toString()})(${JSON.stringify(payload)},{});}catch(e){}})();`;
}
