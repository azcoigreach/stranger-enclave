'use strict';
// Only the isolated processor fixture uses this driver. No database/network API.
const path=require('node:path');
module.exports={constants:require(path.join(process.env.ENCLAVE_ENGINE_ROOT,'../common/lib/constants')),
  config:{emit(){}},sendNotification(){}};
