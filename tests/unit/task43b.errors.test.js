const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyError, errorHandler, notFoundHandler } = require('../../backend/src/middlewares/error.middleware');
const AppError = require('../../backend/src/utils/appError');

function response() {
  return {headersSent:false,statusCode:200,
    status(n){this.statusCode=n;return this;},
    json(data){this.payload=data;return this;}};
}
test('4.3b: application errors keep status and stable error envelope',()=>{
  const res=response();
  errorHandler(new AppError(409,'INVALID_STATE_TRANSITION','Already completed'),{method:'POST',path:'/return',requestId:'req'},res,()=>{});
  assert.equal(res.statusCode,409);assert.deepEqual(res.payload,{success:false,error:{code:'INVALID_STATE_TRANSITION',message:'Already completed'}});
});
test('4.3b: DB duplicate, deadlock, foreign key and data truncation map to non-500',()=>{
  for (const [code,status] of [['ER_DUP_ENTRY',409],['ER_LOCK_DEADLOCK',409],['ER_LOCK_WAIT_TIMEOUT',409],['ER_NO_REFERENCED_ROW_2',400],['ER_DATA_TOO_LONG',400],['ER_BAD_NULL_ERROR',400]]) {
    const err=classifyError(Object.assign(new Error('raw SQL detail'),{code}));
    assert.equal(err.statusCode,status);
    assert.ok(!err.message.includes('SQL'));
  }
});
test('4.3b: parser errors return 400 and 413',()=>{
  assert.equal(classifyError({type:'entity.parse.failed'}).statusCode,400);
  assert.equal(classifyError({type:'entity.too.large'}).statusCode,413);
});
test('4.3b: unexpected SQL errors hide internal DB details from clients',()=>{
  const res=response(),old=console.error;console.error=()=>{};
  try {
    errorHandler(new Error('SELECT * FROM users; password=secret'),{method:'GET',path:'/hi',requestId:'req'},res,()=>{});
  } finally {console.error=old;}
  assert.equal(res.statusCode,500);
  assert.equal(res.payload.error.message,'An unexpected server error occurred.');
});
test('4.3b: unknown endpoints use standard error envelope',()=>{
  const res=response();notFoundHandler({method:'GET',path:'/does-not-exist'},res);
  assert.equal(res.statusCode,404);
  assert.equal(res.payload.error.code,'NOT_FOUND');
});