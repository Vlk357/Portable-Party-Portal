curl -v -X POST http://127.0.0.1:8080/auth/api/user -H "Content-Type: application/json" -d '{
    "username": "second_user",
    "password": "nEw_45_password"
}'

curl -v -X POST http://127.0.0.1:8080/auth/api/login -H "Content-Type: application/json" -d '{
    "username": "second_user",
    "password": "nEw_45_password"
}'

curl -v http://127.0.0.1:8080/auth/api/user/2 \
    -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3NDE4OTExMzksImV4cCI6MTc0MTg5NDczOSwicm9sZXMiOltdLCJ1c2VybmFtZSI6InNlY29uZF91c2VyIn0.RFYrH50608-dIX6UIsaVUPWheKyl3x68mqt5E3fbZUxG7zDfexztsPWaIIbeW_8X84e2p12SrEtV_MOiqoNg90Cm_PSV1zQpuCFQZVU2RTCnEq3xRB546xyJuSL21Mqay0mSHARPL87A43yEHKU8dAA9xw0mLUSlWnkjkDoXZ0w18zpS141HcXEF88eRfGVuSbrdhGh4AFgrIsLwwzXxBLLz-RQ8qZ5VfB2QiTnzx9g5kK4yp189qEgoniiIeR24Te7A_RkdhJT65QpWXxwducZtcWOAik9nGDNnl2m9a7e91CsvQJUw_4EJVME36brPDKgrffYysK7zoDE5ilv29w"

curl -v http://127.0.0.1:8080/auth/api/ability \
    -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3NDIwNTU4NDAsImV4cCI6MTc0MjA1OTQ0MCwicm9sZXMiOltdLCJ1c2VybmFtZSI6InNlY29uZF91c2VyIn0.KCDyzys9sCZYvckChHl5pdGDKya_rJCWx8xi2dRMa0gz0ndN3514p5QJq_6N0BYcr9bkS19SkO-xOG2PYnq7w0_uOm2NKHYKnmC5Y4j7mGNiLGga-PxXPOXsabJXutwMMqsQ_8pGgyJsI21wnkSH5BwOoxG_cqnAOy8xPPgJdwGhnqkvCiFWixrlIrDu-wdwOnTI3qkAK7AaC26qvVEp1eAdHLyuaLRPZMXRjgkmFcgUsmb154shR65A85P7DRFoBqTOhXzT3AtQoXiew-MD4h5mglG0c_FoVDRZUCVxJ4eXjvB-U44hEyJCDcbkK7TcyPwOmuuuKDzD3MhLJU0wYQ"

