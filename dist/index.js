(function (global, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports);
    global.index = mod.exports;
  }
})(this, function (exports) {
  'use strict';

  Object.defineProperty(exports, '__esModule', {
    value: true
  });

  var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

  exports.instanceStatusToString = instanceStatusToString;

  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

  var AWS = require('aws-sdk');
  var execSync = require('child_process').execSync;

  var InstanceStatus = {
    Pending: 0,
    Running: 16,
    ShuttingDown: 32,
    Terminated: 48,
    Stopping: 64,
    Stopped: 80
  };

  exports.InstanceStatus = InstanceStatus;

  function instanceStatusToString(instanceStatus) {
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

  var EC2Helper = (function () {

    // Constructs an EC2Helper object
    // @param config A configuration object like so:
    // {
    //   region: 'us-west-2',
    //   accessKeyId: '<your-access-key>',
    //   secretAccessKey: '<your-secret-key>',
    // }

    function EC2Helper(config) {
      _classCallCheck(this, EC2Helper);

      this.config = config || {};
      this.ec2 = new AWS.EC2(this.config);
    }

    _createClass(EC2Helper, [{
      key: 'executeCommand',

      /**
       * Executes the specified command on the specified host and waits until it ends.
       */
      value: function executeCommand(host, pemPath, command) {
        var username = arguments.length <= 3 || arguments[3] === undefined ? 'ubuntu' : arguments[3];

        execSync('ssh -o "StrictHostKeyChecking no" -i ' + pemPath + ' ' + username + '@' + host + ' "' + command + '"');
      }
    }, {
      key: 'runInstance',

      /**
       * Starts a single instance and resolves a promise upon success with the following data:
       * {
       *   instanceId: 'i-something',
       *   host: 'some-host',
       * }
       * The promise is not resolved until the instance is actually started.
       */
      value: function runInstance(imageId, instanceType, keyName, securityGroupId) {
        var _this = this;

        return new Promise(function (resolve, reject) {
          var params = {
            ImageId: imageId,
            MaxCount: 1,
            MinCount: 1,
            InstanceType: instanceType,
            KeyName: keyName,
            SecurityGroupIds: [securityGroupId],
            DryRun: false
          };
          _this.ec2.runInstances(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              (function () {
                var instanceId = data.Instances[0].InstanceId;
                var intervalId = setInterval(function () {
                  _this.describeInstances(instanceId).then(function (instances) {
                    var instance = instances[0];
                    if (instance.instanceStatus === InstanceStatus.Running) {
                      resolve({
                        instanceId: instanceId,
                        host: instance.host
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
              })();
            }
          });
        });
      }
    }, {
      key: 'terminateInstance',

      /**
       * Stops the specified instance ID and resolves a promise when done issuing the command
       */
      value: function terminateInstance(instanceId) {
        var _this2 = this;

        return new Promise(function (resolve, reject) {
          var params = {
            InstanceIds: [instanceId],
            DryRun: false
          };

          _this2.ec2.terminateInstances(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              (function () {
                var intervalId = setInterval(function () {
                  _this2.describeInstanceStatus(instanceId).then(function (instanceStatus) {
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
              })();
            }
          });
        });
      }
    }, {
      key: 'describeInstanceStatus',

      /**
       * Obtains the specified instance status and resolve with a value
       * which can be used in comparison with one of the InstanceStatus values.
      */
      value: function describeInstanceStatus(instanceId) {
        var _this3 = this;

        return new Promise(function (resolve, reject) {
          var params = {
            DryRun: false,
            // true to include even non running
            IncludeAllInstances: true,
            InstanceIds: [instanceId],
            NextToken: null
          };
          _this3.ec2.describeInstanceStatus(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              resolve(data.InstanceStatuses[0].InstanceState.Code);
            }
          });
        });
      }
    }, {
      key: 'describeInstances',

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
      value: function describeInstances() {
        var _this4 = this;

        var maxResultsOrInstanceId = arguments.length <= 0 || arguments[0] === undefined ? 32 : arguments[0];

        var params = {
          DryRun: false
        };
        if (typeof maxResultsOrInstanceId === 'string') {
          params.InstanceIds = [maxResultsOrInstanceId];
        } else {
          params.MaxResults = maxResultsOrInstanceId;
        }

        return new Promise(function (resolve, reject) {
          _this4.ec2.describeInstances(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              var instances = data.Reservations.reduce(function (list, reservation) {
                return list.concat(reservation.Instances.map(function (instance) {
                  return {
                    instanceId: instance.InstanceId,
                    instanceStatus: instance.State.Code,
                    statusName: instance.State.Name,
                    host: instance.PublicDnsName
                  };
                }));
              }, []);
              resolve(instances);
            }
          });
        });
      }
    }]);

    return EC2Helper;
  })();

  exports['default'] = EC2Helper;
});

//# sourceMappingURL=index.js.map