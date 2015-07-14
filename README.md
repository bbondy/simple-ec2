# simple-ec2

Simple ES6 wrapper for AWS node JS SDK for creating, terminating, listing, and running scripts on EC2 instances

If you want to do anything complex you should be using the AWS JS SDK directly:
http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeInstances-property

## Installation instructions:

```
npm install --save simple-ec2
```


## Example usage:

```
let ec2Helper = new EC2Helper({
  region: 'us-west-2'
  // Enable these lines if you don't want to do aws configure
  //accessKeyId: 'your-access-key',
  //secretAccessKey: 'your-secret-key',
});

// Describe the instances
ec2Helper.describeInstances().then((instances) => {
  console.log(instances);
});

// Start an instance, wait for it to start, execute a command, and terminate the instance.
ec2Helper.runInstance('ami-myid', 't2.large', 'my-key', 'sg-mySecurityGroupId').then((instance) => {
  ec2Helper.executeCommand(instance.host, '~/.ssh/my-key.pem', 'some-command');
  console.log('Started instance: ', instance);
  ec2Helper.terminateInstance(instance.instanceId).then(() => {
    console.log('stopped instance!');
  });
});
```
