const test=require('node:test');
const assert=require('node:assert/strict');
const {requiredId,windowOf,battery}=require('../../backend/src/modules/reservations/reservations.validation');
test('reject invalid identifiers',()=>{assert.throws(()=>requiredId('abc','id'));assert.equal(requiredId('12','id'),12)});
test('validate battery bounds',()=>{assert.equal(battery(0),0);assert.equal(battery(100),100);assert.throws(()=>battery(101));});
test('validate parking booking window',()=>{
const a=new Date(Date.now()+3600000).toISOString(),b=new Date(Date.now()+7200000).toISOString();
assert.ok(windowOf(a,b).start);assert.throws(()=>windowOf(b,a));
});