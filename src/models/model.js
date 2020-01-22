/* eslint-disable standard/no-callback-literal */
const Action = require('../action');

const createdAt = 'createdAt';
const updatedAt = 'updatedAt';

function isNil(obj) {
  return obj == null;
}

/**
* @param {object} gorm
* @param {string} gremlinStr
*/
class Model {
  constructor(gorm, gremlinStr) {
    this.g = gorm;
    this.gremlinStr = gremlinStr;
    this.checkModels = false;
  }

  defaultCreateProps() {
    const current = this.dateGetMillis(new Date());
    return { [createdAt]: current, [updatedAt]: current };
  }

  static isDefaultDateProp(key) {
    return key === createdAt || key === updatedAt;
  }

  getCleanModel() {
    return this.cleanModel || this;
  }

  cloneClean() {
    // Why do we use cleanModel? This is the due to dangers of Object.create. Consider following example:
    // const test = { a: 100, b: 200 }
    // const test2 = Object.create(test)
    // test2.b = 250
    // test2.c = 300
    // console.log(test2) ==> { b: 250, c: 300 }
    // ??????? console.log(test2.a) ==> 100 ???????
    // console.log(test2.b) ==> 250
    // We always want to clone cleaner model (just functions) and not the one which already has property values in it
    return Object.create(this.getCleanModel());
  }

  /**
  * Perform a cypher query and parse the results
  * @param {string} string
  * @param {boolean} raw
  */
  query(string, raw, callback) {
    let cb = callback;
    let returnRawData = raw;
    if (arguments.length < 3) {
      cb = arguments[1];
      returnRawData = false;
    }
    this.checkModels = true;
    let gremlinStr = this.getGremlinStr();
    gremlinStr += string;
    if (returnRawData) {
      this.checkModels = false;
      return this.g.queryRaw(gremlinStr, cb);
    }
    return this.executeOrPass(gremlinStr, cb);
  }

  /**
  * Updates specific props on an existing vertex or edge
  */
  update(props, callback) {
    if (!callback) throw new Error('Callback is required');
    let gremlinStr = this.getGremlinStr();
    const schema = this.schema;
    const propsToUse = Object.assign({ [updatedAt]: this.dateGetMillis(new Date()) }, props);
    const checkSchemaResponse = this.checkSchema(schema, propsToUse);
    if (this.checkSchemaFailed(checkSchemaResponse)) return callback(checkSchemaResponse); // should it throw an error?
    gremlinStr += this.actionBuilder(Action.Property_Update, propsToUse);
    return this.executeOrPass(gremlinStr, callback, !Array.isArray(this));
  }

  /**
  * Deletes an existing vertex or edge
  * @param {string} id id of the vertex or edge to be deleted
  */
  delete(callback) {
    if (!callback) throw new Error('Callback is required');
    let gremlinStr = this.getGremlinStr();
    gremlinStr += '.drop()';
    this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Sorts query results by property in ascending/descending order
  * @param {string} propKey property to sort by.
  * @param {string} option 'ASC' or 'DESC'.
  */
  order(propKey, option, callback) {
    if (!(option === 'DESC' || option === 'ASC')) {
      callback({ error: 'Order requires option to be "ASC" or "DESC"' });
      return;
    }
    const originalGremlinStr = this.getGremlinStr();
    const order = originalGremlinStr.includes('order()') ? '' : '.order()';
    let gremlinStr = `${originalGremlinStr}${order}.by(`;
    const gremlinOption = option === 'DESC' ? 'decr' : 'incr';
    gremlinStr += `'${propKey}', ${gremlinOption})`;
    return this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Limits the number of results returned
  * @param {number} num number of results to be returned
  */
  limit(num, callback) {
    let gremlinStr = this.getGremlinStr();
    gremlinStr += `.limit(${parseInt(num)})`;
    this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Retrives results in the range specified
  * @param {number} start starting index (inclusive)
  * @param {number} end ending index (exlusive)
  */
  range(start, end, callback) {
    let gremlinStr = this.getGremlinStr();
    gremlinStr += `.range(${parseInt(start)}, ${parseInt(end)})`;
    this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Takes the built query string and executes it
  * @param {string} query query string to execute.
  * @param {object} singleObject
  */
  executeQuery(query, callback, singleObject) {
    this.g.log(`query: ${query}`);
    this.g.queryRaw(query, (err, result) => {
      if (err) {
        callback({ error: err });
        return;
      }
      // Create nicer Object
      const response = this.g.familiarizeAndPrototype.call(this, result);
      if (singleObject) {
        callback(null, response[0] || null);
      } else {
        callback(null, response);
      }
    });
  }

  /**
  * Executes or passes a string of command
  * @param {string} gremlinStr
  * @param {object} singleObject
  */
  executeOrPass(gremlinStr, callback, singleObject) {
    if (callback) return this.executeQuery(gremlinStr, callback, singleObject);
    const response = this.cloneClean();
    response.gremlinStr = gremlinStr;
    return response;
  }

  /**
  * Calls method defined as part of schema
  * @param {string} methodName
  * @param {array} args
  */
  invoke(methodName, ...args) {
    if (!this.hasMethod(methodName)) throw new Error('Method not found');
    return this.methods[methodName].apply(this, args);
  }

  hasMethod(methodName) {
    return !!this.methods[methodName];
  }

  /**
  * Builds a command string to be executed or passed using props
  * @param {string} action e.g., 'has', 'property'
  * @param {object} props
  */
  actionBuilder(action, props) {
    let propsStr = '';
    const keys = Object.keys(props);
    keys.forEach(key => {
      if (key !== 'id') {
        const createdActions = action(key, props[key]);
        const actionsArray = Array.isArray(createdActions) ? createdActions : [createdActions];
        for (const actionInstance of actionsArray) {
          propsStr += `.${actionInstance.getGremlinStr()}`;
        }
      }
    });
    return propsStr;
  }

  /**
  * Attaches array methods for later use
  */
  addArrayMethods(arr) {
    if (this.constructor.name === 'VertexModel') {
      arr.createEdge = this.createEdge;
      arr.findEdge = this.findEdge;
      arr.findEdgeType = this.findEdgeType;
      arr.findImplicit = this.findImplicit;
    } else if (this.constructor.name === 'EdgeModel') {
      arr.findVertex = this.findVertex;
    }
    arr.order = this.order;
    arr.limit = this.limit;
    arr.update = this.update;
    arr.delete = this.delete;
    arr.query = this.query;
    arr.actionBuilder = this.actionBuilder;
    arr.getGremlinStr = this.getGremlinStr;
    arr.getIdFromProps = this.getIdFromProps;
    arr.parseProps = this.parseProps.bind(this);
    arr.dateGetMillis = this.dateGetMillis;
    arr.getRandomVariable = this.getRandomVariable;
    arr.checkSchema = this.checkSchema.bind(this);
    arr.checkSchemaFailed = this.checkSchemaFailed;
    arr.executeOrPass = this.executeOrPass.bind(this);
  }

  /**
  *
  */
  getGremlinStr() {
    if (this.gremlinStr && this.gremlinStr !== '') return this.gremlinStr;
    if (this.constructor.name === 'Array') {
      if (this.length === 0) return 'g.V(\'nonexistent\')';
      const type = this[0].constructor.name.charAt(0);
      const ids = [];
      this.forEach((el) => ids.push(el.id));
      return `g.${type}("${ids.join('","')}")`;
    }
    if (Object.prototype.hasOwnProperty.call(this, 'id')) return `g.${this.constructor.name.charAt(0)}('${this.id}')`;
    return '';
  }

  /**
  * returns the id of the vertex or edge
  */
  getIdFromProps(props) {
    let idString = '';
    if (Object.prototype.hasOwnProperty.call(props, 'id')) {
      if (Array.isArray(props.id)) {
        idString = props.id.map(i => Action.stringifyValue(i)).join(',');
      } else {
        idString = Action.stringifyValue(props.id);
      }
    }
    return idString;
  }

  /**
  * Returns an array of random variables
  * @param {number} numVars desired number of variables returned
  * @param {array} currentVarsArr array of variables that already exist
  */
  getRandomVariable(numVars, currentVarsArr) {
    const variables = currentVarsArr ? Array.from(currentVarsArr) : [];
    const possibleChars = 'abcdefghijklmnopqrstuvwxyz';
    let variablesRequired = numVars || 1;
    function getRandomChars() {
      const result = possibleChars[Math.floor(Math.random() * possibleChars.length)];
      return result;
    }
    if (variables.length + variablesRequired > 26) {
      variablesRequired = 26 - variables.length;
    }
    for (let i = 0; i < variablesRequired; i += 1) {
      let newVariable = getRandomChars();
      while (variables.includes(newVariable)) {
        newVariable = getRandomChars();
      }
      variables.push(newVariable);
    }
    return variables;
  }

  /**
 * Parses properties into their known types from schema model
 * Will remove keys which do not exist in schema
 * @param {object} properties - properties object to parse
 * @param {object} model - model to check schema against
 */
  parseProps(properties, model) {
    const schema = Object.assign({ id: { type: 'string' }, [createdAt]: { type: 'date' }, [updatedAt]: { type: 'date' } }, model ? model.schema : this.schema);
    const props = {};
    const that = this;

    function changeTypes(key, input) {
      const defaultDateProp = Model.isDefaultDateProp(key);
      const type = defaultDateProp ? 'date' : schema[key].type;
      let value;
      switch (type) {
        case 'number':
          value = parseFloat(input);
          if (Number.isNaN(value)) value = null;
          break;
        case 'boolean': {
          const boolStr = input.toString();
          if (boolStr === 'true' || boolStr === 'false') {
            value = boolStr === 'true';
          } else {
            value = null;
          }
          break;
        }
        case 'date': {
          const millis = that.dateGetMillis(input);
          value = Number.isNaN(millis) ? null : millis;
          break;
        }
        default: // string
          value = input.toString();
      }
      return value;
    }

    function changeTypeWrapper(key, value) {
      if (value instanceof Action) {
        const newParams = changeTypeWrapper(key, value.params);
        return new Action(value.operation, newParams);
      } else if (Array.isArray(value)) {
        return value.map(arrValue => changeTypes(key, arrValue));
      } else {
        return changeTypes(key, value);
      }
    }

    Object.keys(schema).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        props[key] = changeTypeWrapper(key, properties[key]);
      }
    });
    return props;
  }

  /**
  * Checks Date types and parses it into millis
  * @param {Date/String/Number} value - number string or date representing date
  */
  dateGetMillis(value) {
    let millis = NaN;
    if (value instanceof Date) {
      millis = value.getTime();
    } else {
      const strValue = value.toString();
      const isNum = /^\d+$/.test(strValue);
      if (isNum) {
        millis = parseInt(strValue);
      } else {
        millis = Date.parse(strValue);
      }
    }
    return millis;
  }

  /**
  * Checks whether the props object adheres to the schema model specifications
  * @param {object} schema
  * @param {object} props
  * @param {boolean} checkRequired should be true for create and update methods
  */
  checkSchema(schema, props, checkRequired) {
    const schemaKeys = Object.keys(schema);
    const propsKeys = Object.keys(props);
    const response = {};

    function addErrorToResponse(key, message) {
      if (!response[key]) response[key] = [];
      response[key].push(message);
    }

    if (checkRequired) {
      for (const sKey of schemaKeys) {
        if (schema[sKey].required) {
          if (isNil(props[sKey])) {
            addErrorToResponse(sKey, `A valid value for '${sKey}' is required`);
          }
        }
      }
    }

    for (const pKey of propsKeys) {
      const defaultDateProp = Model.isDefaultDateProp(pKey);
      if (defaultDateProp || schemaKeys.includes(pKey)) {
        if (defaultDateProp || schema[pKey].type === this.g.DATE) {
          const millis = this.dateGetMillis(props[pKey]);
          if (Number.isNaN(millis)) {
            addErrorToResponse(pKey, `'${pKey}' should be a Date`);
          } else {
            props[pKey] = millis; // known side-effect
          }
        } else {
          if (schema[pKey].isArray) {
            if (!Array.isArray(props[pKey])) {
              addErrorToResponse(pKey, `'${pKey}' should be an array`);
            } else {
              for (const item of props[pKey]) {
                // eslint-disable-next-line valid-typeof
                if (!(typeof item === schema[pKey].type)) {
                  addErrorToResponse(pKey, `'${pKey}' should contain ${schema[pKey].type}`);
                }
              }
            }
          } else {
            // eslint-disable-next-line valid-typeof
            if (!(typeof props[pKey] === schema[pKey].type)) {
              addErrorToResponse(pKey, `'${pKey}' should be a ${schema[pKey].type}`);
            }
          }
        }
      } else {
        addErrorToResponse(pKey, `'${pKey}' is not part of the schema model`);
      }
    }
    return response;
  }

  /**
   * returns true if response is an empty object and false if it contains any error message
   * @param {object} response return value from checkSchema
  */
  checkSchemaFailed(response) {
    if (Object.keys(response).length === 0) return false;
    return true;
  }
}

module.exports = Model;
