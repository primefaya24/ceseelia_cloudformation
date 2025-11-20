# Lambda local development & testing
We can run all lambda on a local http server created by sam:
```bash
./run_local.sh
```

# Lambda deployment to dev and prod
We can deploy to dev, staging, or prod by using executing the run.sh script:
```bash
./run.sh dev
```

# Creating a new lambda (HTTP GET)
Creating a new http lambda is a 2-step process:
1. Creating a lambda folder in: lambda/api/http-api/
2. Adding the SAM code that attaches the lambda source code to the http api gateway

```bash
  ### ABC ###
  ABC:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ABC-ReserveXpress-${StageName}-${ApiVersion}
      CodeUri: ./lambda/api/http-api/v1 # <FOLDER_NAME>
      Handler: app.lambdaHandler
      Policies:
        - AmazonDynamoDBFullAccess
      Events:
        ExplicitApi:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Method: GET
            Path: /url/path/{param1}
            PayloadFormatVersion: "2.0"
            RouteSettings:
              ThrottlingBurstLimit: 600
```

# Creating a new lambda (HTTP POST)
Creating a new http lambda is a 2-step process:
1. Creating a lambda folder in: lambda/api/http-api/
2. Adding the SAM code that attaches the lambda source code to the http api gateway

```bash
  ### ABC ###
  ABC:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ABC-ReserveXpress-${StageName}-${ApiVersion}
      CodeUri: ./lambda/api/http-api/v1 # <FOLDER_NAME>
      Handler: app.lambdaHandler
      Policies:
        - AmazonDynamoDBFullAccess
      Events:
        ExplicitApi:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Method: POST
            Path: /url/path # url path for this lambda
            PayloadFormatVersion: "2.0"
            RouteSettings:
              ThrottlingBurstLimit: 600
```

# Creating a new lambda (HTTP PUT)
Creating a new http lambda is a 2-step process:
1. Creating a lambda folder in: lambda/api/http-api/
2. Adding the SAM code that attaches the lambda source code to the http api gateway

```bash
  ### ABC ###
  ABC:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ABC-ReserveXpress-${StageName}-${ApiVersion}
      CodeUri: ./lambda/api/http-api/v1 # <FOLDER_NAME>
      Handler: app.lambdaHandler
      Policies:
        - AmazonDynamoDBFullAccess
      Events:
        ExplicitApi:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Method: PUT
            Path: /url/path # url path for this lambda
            PayloadFormatVersion: "2.0"
            RouteSettings:
              ThrottlingBurstLimit: 600
```

# Creating a new lambda (HTTP DELETE)
Creating a new http lambda is a 2-step process:
1. Creating a lambda folder in: lambda/api/http-api/
2. Adding the SAM code that attaches the lambda source code to the http api gateway

```bash
  ### ABC ###
  ABC:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ABC-ReserveXpress-${StageName}-${ApiVersion}
      CodeUri: ./lambda/api/http-api/v1 # <FOLDER_NAME>
      Handler: app.lambdaHandler
      Policies:
        - AmazonDynamoDBFullAccess
      Events:
        ExplicitApi:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Method: DELETE
            Path: /url/path/{param1}
            PayloadFormatVersion: "2.0"
            RouteSettings:
              ThrottlingBurstLimit: 600
```

# Creating a new lambda (WEBSOCKET)
Creating a new websocket lambda is a also 2-step process:
1. Creating a lambda folder in: lambda/api/websocket-api/
2. Adding the SAM code that attaches the lambda source code to the websocket api gateway

For step 1, we already have a websocket lambda template in: lambda/api/websocket-api/z-lambda-fresh
Simply duplicate this folder in the desired directory (within lambda/api/websocket-api) and rename it to the desired lambda name.
The above file has a base websocket lambda template where you can jump right into javascript development.

For step 2, the following resources need to be added to the resource section under websocket

```bash
  ### ABC ###
  ABCRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref WebsocketApi
      RouteKey: ABC
      AuthorizationType: NONE
      OperationName: ABCRoute
      Target: !Join
        - '/'
        - - 'integrations'
          - !Ref ABCIntegration
        
  ABCIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref WebsocketApi
      Description: ABC Integration
      IntegrationType: AWS_PROXY
      IntegrationUri: 
        Fn::Sub: arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ABC.Arn}/invocations

  ABCPermission:
    Type: AWS::Lambda::Permission
    DependsOn:
      - WebsocketApi
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !Ref ABC
      Principal: apigateway.amazonaws.com        

  ABC:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ABC-ReserveXpress-${StageName}-${ApiVersion}
      CodeUri: ./lambda/api/websocket-api/v1/ # <FOLDER_NAME>
      Handler: app.lambdaHandler
      Policies:
        - AmazonDynamoDBFullAccess
        - AmazonAPIGatewayInvokeFullAccess
```

Within the file, search for all appearances of the string "ABC" and change them all to the same desired lambda name.
The last step is to add the relevant folder name as mentioned in the comment in the snippit above.

```bash
// GET COGNITO ACCESS TOKEN
TOKEN=`aws cognito-idp initiate-auth \
  --client-id 1qltt5stlpd1v26pi70cb2el0d \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=shukybadeer@gmail.com,PASSWORD=Shuky054@ \
  --profile default \
  --region us-east-1 \
  --query AuthenticationResult.AccessToken \
  --output text`
echo $TOKEN
```

# Websocket route examples

```
// Api URL
  wss://dev.ws.ReserveXpress.ReserveXpress.com
```

```
// Routes
{"action": "OnHeartbeat", "data": {}}
{"action": "ListenToWebsocket", "data": {"cognito_token": ""}}
{"action": "SendRelationshipRequest", "data": {"from_name": "", "to_uuid": "", "cognito_token": ""}}
{"action": "RespondToRelationshipRequest", "data": {"from_name": "", "status": "REJECTED", "cognito_token": ""}}
```
