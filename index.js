var AWS = require('aws-sdk');
var execSync = require('child_process').execSync;

export let InstanceStatus = {
  Pending: 0,
  Running: 16,
  ShuttingDown: 32,
  Terminated: 48,
  Stopping: 64,
  Stopped: 80,
};

export function instanceStatusToString(instanceStatus) {
  switch (instanceStatus) {
    case InstanceStatus.Pending:
      return 'pending';
    case InstanceStatus.Running:
      return 'running';
    case InstanceStatus.ShuttingDown:
      return 'shutting down';
    case InstanceStatus.Terminated:
      return 'terminated';
    case InstanceStatus.Stopping:
      return 'stopping';
    case InstanceStatus.Stopped:
      return 'stopped';
  }
  return 'unknown';
}

/**
 * Wraps the AWS JS SDK to provides a super simple ES6 promise based API for working with
 * AWS' EC2.  If you want to do anything complex you should be using the AWS JS SDK directly:
 * http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeInstances-property
 */
export default class EC2Helper {

  // Constructs an EC2Helper object
  // @param config A configuration object like so:
  // {
  //   region: 'us-west-2',
  //   accessKeyId: '<your-access-key>',
  //   secretAccessKey: '<your-secret-key>',
  // }
  constructor(config) {
    this.config = config || {};
    this.ec2 = new AWS.EC2(this.config);
  }

  /**
   * Executes the specified command on the specified host and waits until it ends.
   */
  executeCommand(host, pemPath, command, username = 'ubuntu') {
    execSync(`ssh -o "StrictHostKeyChecking no" -i ${pemPath} ${username}@${host} "${command}"`);
  }

  /**
   * Starts a single instance and resolves a promise upon success with the following data:
   * {
   *   instanceId: 'i-something',
   *   host: 'some-host',
   * }
   * The promise is not resolved until the instance is actually started.
   */
  runInstance(imageId, instanceType, keyName, securityGroupId) {
    return new Promise((resolve, reject) => {
      var params = {
        ImageId: imageId,
        MaxCount: 1,
        MinCount: 1,
        InstanceType: instanceType,
        KeyName: keyName,
        SecurityGroupIds: [securityGroupId],
        DryRun: false,
      };
      this.ec2.runInstances(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          let instanceId = data.Instances[0].InstanceId;
          let intervalId = setInterval(() => {
            this.describeInstances(instanceId).then(instances => {
              let instance = instances[0];
              if (instance.instanceStatus === InstanceStatus.Running) {
                resolve({
                  instanceId,
                  host: instance.host,
                });
                clearInterval(intervalId);
              } else if (instance.instanceStatus === InstanceStatus.Pending) {
                // Continue to next interval timeout
                return;
              } else {
                reject('Instance was started but status is: ' + instance.instanceStatus);
              }
            });
          }, 1000);
        }
      });
    });
  }

  /**
   * Stops the specified instance ID and resolves a promise when done issuing the command
   */
  terminateInstance(instanceId) {
    return new Promise((resolve, reject) => {
      var params = {
        InstanceIds: [instanceId],
        DryRun: false,
      };

      this.ec2.terminateInstances(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          let intervalId = setInterval(() => {
            this.describeInstanceStatus(instanceId).then(instanceStatus => {
              if (instanceStatus === InstanceStatus.Terminated) {
                resolve(data);
                clearInterval(intervalId);
              } else if (instanceStatus === InstanceStatus.ShuttingDown) {
                // Continue to next interval timeout
                return;
              } else {
                reject('Instance termination was done but status is: ' + instanceStatus);
              }
            });
          }, 1000);
        }
      });
    });
  }

  /**
   * Obtains the specified instance status and resolve with a value
   * which can be used in comparison with one of the InstanceStatus values.
  */
  describeInstanceStatus(instanceId) {
    return new Promise((resolve, reject) => {
      var params = {
        DryRun: false,
        // true to include even non running
        IncludeAllInstances: true,
        InstanceIds: [instanceId],
        NextToken: null,
      };
      this.ec2.describeInstanceStatus(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.InstanceStatuses[0].InstanceState.Code);
        }
      });
    });
  }

  /**
   * Describes all fo the instances which are running
   * Returns an array like this:
   * [{
   *   instanceId: '',
   *   instanceStatus: 16,
   *   statusName: 'running',
   *   host: 'some-host'
   * }, ...]
   */
  describeInstances(maxResultsOrInstanceId = 32) {
    var params = {
      DryRun: false,
    };
    if (typeof maxResultsOrInstanceId === 'string') {
      params.InstanceIds = [maxResultsOrInstanceId];
    } else {
      params.MaxResults = maxResultsOrInstanceId;
    }

    return new Promise((resolve, reject) => {
      this.ec2.describeInstances(params, function(err, data) {
        if (err) {
          reject(err);
        } else {
          let instances = data.Reservations.reduce((list, reservation) => {
            return list.concat(reservation.Instances.map((instance) => {
              return {
                instanceId: instance.InstanceId,
                instanceStatus: instance.State.Code,
                statusName: instance.State.Name,
                host: instance.PublicDnsName,
              };
            }));
          }, []);
          resolve(instances);
        }
      });
    });
  }
}
