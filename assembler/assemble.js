'use strict';

var self = assemble;
module.exports = self;

var _ = require('underscore');
var fs = require('fs');
var path = require('path');

// overriding the delimiters to %%context%%
_.templateSettings = _.extend(_.templateSettings,
  { interpolate: /\%\%([\s\S]+?)\%\%/g });


var execGrpTemplate = _.template(fs.readFileSync(
  path.resolve(__dirname, '_templates', 'execGrp.sh'), 'utf8').toString());

var isDirectory = require('../_common/helpers/isDirectory.js');
var isFile = require('../_common/helpers/isFile.js');

function assemble(externalBag, callback) {
  var bag = {
    assembledScript: '',
    objectType: externalBag.objectType,
    objectSubType: externalBag.objectSubType,
    json: externalBag.json,
    execTemplatesRootDir: externalBag.execTemplatesRootDir
  };

  bag.who = util.format('%s|assembler|%s', msName, self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _checkInputParams.bind(null, bag),
      _assembleScript.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed to assemble script', err);
      else
        logger.info(bag.who, 'Successfully assembled script');

      var resultBag = {
        assembledScript: bag.assembledScript
      };

      return callback(err, resultBag);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.verbose(who, 'Inside');

  var expectedParams = [
    'objectType',
    'objectSubType',
    'json',
    'execTemplatesRootDir'
  ];

  var paramErrors = [];
  _.each(expectedParams,
    function (expectedParam) {
      if (_.isNull(bag[expectedParam]) || _.isUndefined(bag[expectedParam]))
        paramErrors.push(
          util.format('%s: missing param :%s', who, expectedParam)
        );
    }
  );

  var hasErrors = !_.isEmpty(paramErrors);
  if (hasErrors)
    logger.error(paramErrors.join('\n'));
  return next(hasErrors);
}

function _assembleScript(bag, next) {
  var who = bag.who + '|' + _assembleScript.name;
  logger.verbose(who, 'Inside');

  var rootDirectoryPath = path.resolve(bag.execTemplatesRootDir, bag.objectType,
    bag.objectSubType);
  var headerFilePath = path.join(bag.execTemplatesRootDir, '_common',
    'header.sh');

  if (!isDirectory(rootDirectoryPath))
    return next(util.format('Root directory: %s is incorrect',
      rootDirectoryPath));

  if (!isFile(headerFilePath))
    return next(util.format('Header file path: %s is incorrect',
      headerFilePath));

  bag.assembledScript = fs.readFileSync(headerFilePath, 'utf8').toString();

  __addTemplate(bag.objectSubType, rootDirectoryPath, bag.json, bag);
  return next();
}

// parentDirectoryName: parent directory of the directory being operated on
// currentDirectoryPath: directory path of the directory opreated on
// context: context pertaining to current directory
// bag: pass by reference to assemble the script
function __addTemplate(parentDirectoryName, currentDirectoryPath, context,
  bag) {
  var directoryContents = fs.readdirSync(currentDirectoryPath);
  directoryContents.sort();
  _.each(directoryContents,
    function (contentName) {
      var santizedContentName = contentName;
      if (santizedContentName.indexOf('_') > -1)
        santizedContentName = santizedContentName.split('_')[1];
      if (isDirectory(path.join(currentDirectoryPath, contentName))) {
        if (__contentExistsInCurrentContextObject(context,
          santizedContentName))
          __addTemplate(santizedContentName,
            path.join(currentDirectoryPath, contentName),
            context[santizedContentName], bag);
      } else if (isFile(path.join(currentDirectoryPath, contentName))) {
        var generatedScript = '';
        if (contentName === parentDirectoryName + '.sh' ||
          contentName === context + '.sh') {
          var script = '';
          var templateScript = fs.readFileSync(path.join(currentDirectoryPath,
            contentName), 'utf8').toString();
          var template = _.template(templateScript);
          if (_.isString(context)) {
            script = template({ 'context': __escapeString(context) });
          } else if (_.isArray(context)) {
            _.each(context,
              function (element) {
                if (_.isString(element)) {
                  script += template({ 'context': __escapeString(element) });
                } else if (_.isObject(element)) {
                  script += template({ 'context': element });
                }
              }
            );
          } else if (_.isObject(context)) {
            script = template({ 'context': context });
          }
          generatedScript = __execGrp(parentDirectoryName, parentDirectoryName,
            true, script);
        }

        if (generatedScript.length !== 0)
          bag.assembledScript += generatedScript;
      }
    }
  );
}

function __execGrp(grp, grpDesc, grpVisibility, grpBody) {
  return execGrpTemplate(
    {
      grp: grp,
      grpDesc: grpDesc,
      grpVisibility: grpVisibility,
      grpBody: grpBody
    }
  );
}

function __contentExistsInCurrentContextObject(context, content) {
  return !_.isEmpty(context[content]);
}

function __escapeString(string) {
  string = string.replace(/\\/g, '\\\\');
  string = string.replace(/'/g, "\\'");
  return string;
}