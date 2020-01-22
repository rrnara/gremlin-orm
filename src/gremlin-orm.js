const VertexModel = require('./models/vertex-model');
const EdgeModel = require('./models/edge-model');

const consoleLogger = (msg) => console.log(msg);
const NULL_VERTEX = new VertexModel('null', {}, {}, this.g);
const NULL_EDGE = new EdgeModel('null', {}, {}, this.g);

class Gorm {
  constructor(dialect, connectionPool, logger) {
    // Constants
    this.DIALECTS = { AZURE: 'azure' };
    this.STRING = 'string';
    this.NUMBER = 'number';
    this.BOOLEAN = 'boolean';
    this.DATE = 'date';

    this.connectionPool = connectionPool;
    if (Array.isArray(dialect)) {
      this.dialect = dialect[0];
      this.partitionKey = dialect[1];
      this.partitionValue = dialect[2];
    } else {
      this.dialect = dialect;
    }
    this.logger = (logger === true) ? consoleLogger : logger;
    this.definedVertices = {};
    this.definedEdges = {};
    this.vertexModel = VertexModel;
    this.edgeModel = EdgeModel;
  }

  log(msg) {
    if (this.logger) {
      this.logger(msg);
    }
  }

  /**
  * an alias for defineVertex
  * @param {string} label
  * @param {object} schema
  */
  define(label, schema, methods) {
    return this.defineVertex(label, schema, methods);
  }

  /**
  * defines a new instance of the VertexModel class - see generic and vertex model methods
  * @param {string} label label to be used on all vertices of this model
  * @param {object} schema a schema object which defines allowed property keys and allowed values/types for each key
  */
  defineVertex(label, schema, methods) {
    this.definedVertices[label] = { schema, methods };
    return new VertexModel(label, schema, methods, this);
  }

  /**
  * defines a new instance of the EdgeModel class - see generic and edge model methods
  * @param {string} label label to be used on all edges of this model
  * @param {object} schema a schema object which defines allowed property keys and allowed values/types for each key
  */
  defineEdge(label, schema, methods) {
    this.definedEdges[label] = { schema, methods };
    return new EdgeModel(label, schema, methods, this);
  }

  /**
  * performs a raw query on the gremlin-orm root and return raw data
  * @param {string} string Gremlin query as a string
  * @param {function} callback Some callback function with (err, result) arguments.
  */
  queryRaw(string, callback) {
    const errorCallback = (error) => callback(error);
    const acquireCallback = (client) => {
      client.submit(string)
        .then(
          result => {
            this.connectionPool.release(client);
            callback(null, result)
          },
          error => {
            this.connectionPool.release(client);
            errorCallback(error);
          }
        );
    }
    this.connectionPool.acquire().then(acquireCallback, errorCallback);
  }

  /**
  * Converts raw gremlin data into familiar JavaScript objects
  * Adds prototype methods onto objects for further queries - each object is an instance of its Model class
  * @param {array} gremlinResponse
  */
  familiarizeAndPrototype(gremlinResponse) {
    const data = this.checkModels ? [[], []] : [];
    let gremlinResponseToUse;
    if (Array.isArray(gremlinResponse)) {
      gremlinResponseToUse = gremlinResponse;
    } else if (typeof gremlinResponse === 'object' && Object.prototype.hasOwnProperty.call(gremlinResponse, '_items')) {
      gremlinResponseToUse = gremlinResponse._items;
    } else {
      gremlinResponseToUse = [gremlinResponse];
    }
    gremlinResponseToUse.forEach((grem) => {
      let object;

      const isVertex = grem.type === 'vertex';
      // const isEdge = grem.type === 'edge';
      let definition = null;
      if (!isVertex) {
        const existingDefinition = this.g.definedEdges[grem.label];
        definition = existingDefinition ? new EdgeModel(grem.label, existingDefinition.schema, existingDefinition.methods, this.g) : null;
      } else {
        const existingDefinition = this.g.definedVertices[grem.label];
        definition = existingDefinition ? new VertexModel(grem.label, existingDefinition.schema, existingDefinition.methods, this.g) : null;
      }

      if (this.checkModels) {
        // if checkModels is true (running .query with raw set to false), this may refer to a VertexModel objects
        // but data returned could be EdgeModel
        const cleanModel = definition || (isVertex ? NULL_VERTEX : NULL_EDGE);
        object = Object.create(cleanModel);
        object.cleanModel = cleanModel;
      } else {
        object = this.cloneClean();
        object.cleanModel = this.getCleanModel();
      }
      object.id = grem.id;
      object.label = grem.label;
      if (!isVertex) {
        object.inV = grem.inV;
        object.outV = grem.outV
        if (grem.inVLabel) object.inVLabel = grem.inVLabel;
        if (grem.outVLabel) object.outVLabel = grem.outVLabel;
      }

      const currentPartition = this.g.partitionKey ? this.g.partitionKey : '';
      if (grem.properties) {
        Object.keys(grem.properties).forEach((propKey) => {
          if (propKey !== currentPartition) {
            let property;
            if (!isVertex) {
              property = grem.properties[propKey];
            } else {
              const isArray = definition && definition.schema[propKey] && definition.schema[propKey].isArray;
              property = isArray || grem.properties[propKey].length > 1 ? grem.properties[propKey].map(p => p.value) : grem.properties[propKey][0].value;
            }

            // If property is defined in schema as a Date type, convert it from integer date into a JavaScript Date object.
            // Otherwise, no conversion necessary for strings, numbers, or booleans
            if (definition && (VertexModel.isDefaultDateProp(propKey) || (definition.schema[propKey] && definition.schema[propKey].type === this.g.DATE))) {
              object[propKey] = Array.isArray(property) ? property.map(p => new Date(p)) : new Date(property);
            } else {
              object[propKey] = property;
            }
          }
        });
      }
      if (this.checkModels) {
        if (isVertex) {
          data[0].push(object);
        } else {
          data[1].push(object);
        }
      } else {
        data.push(object);
      }
    });
    if (this.checkModels) {
      NULL_VERTEX.addArrayMethods(data[0]);
      NULL_EDGE.addArrayMethods(data[1]);
    } else {
      this.addArrayMethods(data);
    }
    this.checkModels = false;
    return data;
  }
}

module.exports = Gorm;
