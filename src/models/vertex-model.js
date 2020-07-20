/* eslint-disable new-cap */
/* eslint-disable standard/no-callback-literal */
const Model = require('./model');
const Action = require('../action');

/**
* @param {string} label
* @param {object} schema
* @param {object} gorm
*/
class VertexModel extends Model {
  constructor(label, schema, methods, gorm) {
    super(gorm, '')
    this.label = label;
    this.schema = schema;
    this.methods = methods;
  }

  /**
  * Creates a new vertex
  * Returns single vertex model object
  * @param {object} props
  */
  create(props, callback) {
    if (!callback) throw new Error('Callback is required');
    const checkSchemaResponse = this.checkSchema(this.schema, props, true);
    if (this.checkSchemaFailed(checkSchemaResponse)) {
      callback(checkSchemaResponse);
      return;
    }
    let gremlinStr = `g.addV('${this.label}')`;
    const additionalProps = this.defaultCreateProps();
    if (this.g.dialect === this.g.DIALECTS.AZURE) {
      additionalProps[this.g.partitionKey] = this.g.partitionValue || props[Object.keys(props)[0]];
    }
    gremlinStr += this.actionBuilder(Action.Property, Object.assign(additionalProps, props));
    return this.executeQuery(gremlinStr, callback, true);
  }

  /**
  * Creates a new edge
  * @param {string} edge
  * @param {object} props
  * @param {object} vertex
  */
  createEdge(edgeModel, properties, vertex, bothWays, callback) {
    let both, cb;
    if (typeof arguments[3] === 'function' || arguments.length < 4) {
      both = false;
      cb = arguments[3]
    } else {
      both = arguments[3];
      cb = arguments[4];
    }
    if (!cb) throw new Error('Callback is required');
    let label, props, model;
    if (typeof edgeModel === 'string') {
      label = edgeModel;
      props = properties;
      model = this.g.definedEdges[label] || new this.g.edgeModel(label, {}, {}, this.g)
    } else {
      label = edgeModel.label;
      props = this.parseProps(properties, edgeModel);
      model = edgeModel;
    }

    const outGremlinStr = this.getGremlinStr();
    let inGremlinStr = vertex.getGremlinStr();

    if (outGremlinStr === '') {
      return cb({ error: 'Gremlin Query has not been initialised for out Vertex' });
    } else if (inGremlinStr === '') {
      return cb({ error: 'Gremlin Query has not been initialised for in Vertex' });
    }
    if (typeof edgeModel !== 'string') {
      const checkSchemaResponse = this.checkSchema(edgeModel.schema, props, true);
      if (this.checkSchemaFailed(checkSchemaResponse)) {
        cb(checkSchemaResponse);
        return;
      }
    }

    const additionalProps = this.defaultCreateProps();
    const allProps = Object.assign(additionalProps, props);

    // Remove 'g' from 'g.V()...'
    inGremlinStr = inGremlinStr.slice(1);

    const [a] = this.getRandomVariable();
    let gremlinQuery = outGremlinStr + `.as('${a}')` + inGremlinStr;
    gremlinQuery += `.addE('${label}')${this.actionBuilder(Action.Property, allProps)}.from('${a}')`;

    if (both === true) {
      const [b] = this.getRandomVariable(1, [a]);
      const extraGremlinQuery = `${vertex.getGremlinStr()}.as('${b}')${this.getGremlinStr().slice(1)}` +
                      `.addE('${label}')${this.actionBuilder(Action.Property, allProps)}.from('${b}')`;
      const intermediate = (err, results) => {
        if (err) return cb(err);
        let resultsSoFar = results.slice(0);
        const concater = (err, results) => {
          resultsSoFar = resultsSoFar.concat(results);
          cb(err, resultsSoFar);
        }
        model.executeOrPass(extraGremlinQuery, concater);
      }
      return model.executeOrPass(gremlinQuery, intermediate);
    } else {
      return model.executeOrPass(gremlinQuery, cb, true);
    }
  }

  static findQuery(vertexModel, properties, callback, singleObject) {
    const props = vertexModel.parseProps(properties);
    const gremlinStr = `g.V(${vertexModel.getIdFromProps(props)}).hasLabel('${vertexModel.label}')` + vertexModel.actionBuilder(Action.Has, props);
    return vertexModel.executeOrPass(gremlinStr, callback, singleObject);
  }

  /**
  * Finds first vertex with matching properties
  * @param {object} properties
  */
  find(properties, callback) {
    return VertexModel.findQuery(this, properties, callback, true);
  }

  /**
  * Finds all vertexes with matching properties
  * @param {object} properties
  */
  findAll(properties, callback) {
    return VertexModel.findQuery(this, properties, callback, false);
  }

  /**
  * Finds all vertexes with matching properties with the action is applied
  * @param {Action} action
  * @param {object} properties
  */
  findActionAll(action, properties, callback) {
    const props = this.parseProps(properties);
    const actionInstance = action(props);
    const gremlinStr = `g.V(${this.getIdFromProps(props)}).hasLabel('${this.label}').` + actionInstance.getGremlinStr();
    return this.executeOrPass(gremlinStr, callback, false);
  }

  /**
  * find all vertexes connected to initial vertex(es) through a type of edge with optional properties
  * @param {string} label
  * @param {object} properties
  * @param {boolean} incoming
  * @param {number} depth
  */

  findRelated(edgeModel, properties, incoming, depth, relatedV, callback) {
    let label, props, relatedModel, relatedLabel, cb;
    if (typeof edgeModel === 'string') {
      label = edgeModel;
      props = properties;
    } else {
      label = edgeModel.label;
      props = this.parseProps(properties, edgeModel);
    }

    if (arguments.length < 5 || typeof arguments[3] === 'function') {
      relatedModel = this;
      relatedLabel = this.label;
      cb = arguments[3];
    } else {
      if (typeof relatedV === 'string') {
        relatedLabel = relatedV;
        relatedModel = this.g.definedEdges[relatedLabel] || new this.g.vertexModel(relatedLabel, {}, {}, this.g);
        cb = callback;
      } else {
        relatedModel = relatedV;
        relatedLabel = relatedModel.label;
        cb = callback;
      }
    }

    const edgeStr = incoming ? 'inE()' : 'outE()';
    const vertexStr = incoming ? 'outV()' : 'inV()';
    const inModel = incoming ? this : relatedModel;
    let gremlinStr = this.getGremlinStr();
    for (let i = 0; i < depth; i += 1) {
      gremlinStr += `.${edgeStr}.hasLabel('${label}')${this.actionBuilder(Action.Has, props)}.as('multiple_${label}').${vertexStr}.hasLabel('${relatedLabel}')`;
    }
    return inModel.executeOrPass(gremlinStr, cb);
  }

  /**
  * find all edges connected to initial vertex(es) with matching label and optional properties
  * @param {string} label
  * @param {object} props
  */
  findEdge(edgeModel, properties, callback) {
    let label, props, model;
    if (typeof edgeModel === 'string') {
      label = edgeModel;
      props = properties;
      model = this.g.definedEdges[label] || new this.g.edgeModel(label, {}, {}, this.g)
    } else {
      label = edgeModel.label;
      props = this.parseProps(properties, edgeModel);
      model = edgeModel;
    }
    let gremlinStr = this.getGremlinStr();
    gremlinStr += `.bothE('${label}')${this.actionBuilder(Action.Has, props)}`;
    return model.executeOrPass(gremlinStr, callback);
  }

  /**
  * find all incoming/outgoing edges connected to initial vertex(es) with matching label and optional properties
  * @param {string} label
  * @param {object} props
  */
  findEdgeType(edgeModel, properties, incoming, callback) {
    let label, props, model;
    if (typeof edgeModel === 'string') {
      label = edgeModel;
      props = properties;
      model = this.g.definedEdges[label] || new this.g.edgeModel(label, {}, {}, this.g)
    } else {
      label = edgeModel.label;
      props = this.parseProps(properties, edgeModel);
      model = edgeModel;
    }
    let gremlinStr = this.getGremlinStr();
    const edgeStr = incoming ? 'inE()' : 'outE()';
    gremlinStr += `.${edgeStr}.hasLabel('${label}')${this.actionBuilder(Action.Has, props)}`;
    return model.executeOrPass(gremlinStr, callback);
  }

  /**
  * find all vertexes which have the same edge relations in that the current vertex(es) has out to another vertex
  * @param {string} label
  * @param {object} properties
  */
  findImplicit(edgeModel, properties, callback) {
    let label, props;
    if (typeof edgeModel === 'string') {
      label = edgeModel;
      props = properties;
    } else {
      label = edgeModel.label;
      props = this.parseProps(properties, edgeModel);
    }
    let gremlinStr = this.getGremlinStr();
    const originalAs = this.getRandomVariable()[0];
    gremlinStr += `.as('${originalAs}').outE('${label}')${this.actionBuilder(Action.Has, props)}` +
                  `inV().inE('${label}')${this.actionBuilder(Action.Has, props)}.outV()` +
                  `.where(neq('${originalAs}'))`;
    return this.executeOrPass(gremlinStr, callback);
  }
}

module.exports = VertexModel;
