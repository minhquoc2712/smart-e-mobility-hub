const AppError = require('../../utils/appError');
const { parseId } = require('../../utils/validators');
function requiredId(value, name) { return parseId(value, name); }
function dateTime(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(value))
    throw new AppError(400, 'VALIDATION_FAILED', `${name} must be a date-time string.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(400, 'VALIDATION_FAILED', `Invalid ${name}.`);
  return date;
}
function windowOf(start, end, {maxAdvanceDays=7,minMinutes=30,maxMinutes=720}={}) {
  const s=dateTime(start,'startTime'), e=dateTime(end,'endTime'), now=Date.now();
  if(s.getTime()<now-60000 || s.getTime()>now+maxAdvanceDays*86400000 ||
    e<=s || e-s<minMinutes*60000 || e-s>maxMinutes*60000)
    throw new AppError(422,'INVALID_TIME_WINDOW',`Start must be within 7 days and duration ${minMinutes}-${maxMinutes} minutes.`);
  return {start:mysqlDate(s),end:mysqlDate(e)};
}
function mysqlDate(d) {return d.toISOString().slice(0,19).replace('T',' ');}
function battery(value) {
 const n=Number(value);
 if(!Number.isInteger(n)||n<0||n>100)throw new AppError(400,'VALIDATION_FAILED','batteryLevel must be an integer from 0 to 100.');
 return n;
}
module.exports={requiredId, dateTime, windowOf, mysqlDate, battery};