import { redactEvent } from '../utils/reporting-redaction';
test('telemetry removes private payloads even inside native stack frames', () => {
 const secret='SECRET-TASK user@example.com bearer-123';
 const clean=redactEvent({release:'flowi@sha',user:{email:secret},request:{data:secret},breadcrumbs:[{message:secret}],
 exception:{values:[{type:'Error',value:secret,stacktrace:{frames:[{filename:'/Users/person/index.js?token=secret',lineno:3,vars:{token:secret}}]}}]}});
 expect(JSON.stringify(clean)).not.toContain(secret);
 expect(JSON.stringify(clean)).not.toContain('/Users');
 expect(clean.exception.values[0].stacktrace.frames).toEqual([{filename:'index.js',lineno:3}]);
});
