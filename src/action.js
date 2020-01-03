/* eslint-disable camelcase */
class Action {
  constructor(operation, params) {
    this.operation = operation;
    this.params = params;
  }

  getGremlinStr() {
    const paramsToUse = Array.isArray(this.params) ? this.params : [this.params];
    const gremlinStr = paramsToUse.map(p => Action.stringifyValue(p)).join(',');
    return `${this.operation}(${gremlinStr})`;
  }

  static stringifyValue(value) {
    if (value instanceof Action) {
      return value.getGremlinStr();
    } else if (typeof value === 'string') {
      return `'${value.replace(/(['\\])/g, "\\$1")}'`;
    } else {
      return `${value}`;
    }
  }

  static P_eq(object) {
    return new Action('eq', object);
  }

  static P_neq(object) {
    return new Action('neq', object);
  }

  static P_lt(object) {
    return new Action('lt', object);
  }

  static P_lte(object) {
    return new Action('lte', object);
  }

  static P_gt(object) {
    return new Action('gt', object);
  }

  static P_gte(object) {
    return new Action('gte', object);
  }

  static P_inside(object1, object2) {
    return new Action('inside', [object1, object2]);
  }

  static P_outside(object1, object2) {
    return new Action('outside', [object1, object2]);
  }

  static P_between(object1, object2) {
    return new Action('between', [object1, object2]);
  }

  static P_within(objects) {
    return new Action('within', objects);
  }

  static P_without(objects) {
    return new Action('without', objects);
  }

  static TextP_startingWith(str) {
    return new Action('TextP.startingWith', str);
  }

  static TextP_endingWith(str) {
    return new Action('TextP.endingWith', str);
  }

  static TextP_containing(str) {
    return new Action('TextP.containing', str);
  }

  static TextP_notStartingWith(str) {
    return new Action('TextP.notStartingWith', str);
  }

  static TextP_notEndingWith(str) {
    return new Action('TextP.notEndingWith', str);
  }

  static TextP_notContaining(str) {
    return new Action('TextP.notContaining', str);
  }

  static Property(key, value) {
    if (Array.isArray(value)) {
      return value.map(v => new Action('property', [key, v]));
    } else {
      return new Action('property', [key, value]);
    }
  }

  static Has(key, value) {
    const valueToUse = Array.isArray(value) ? Action.P_within(value) : value;
    return new Action('has', [key, valueToUse]);
  }

  static Or(props) {
    const actions = [];
    for (const key of Object.keys(props)) {
      const valueArray = Array.isArray(props[key]) ? props[key] : [props[key]];
      for (const value of valueArray) {
        const action = Action.Has(key, value);
        actions.push(action);
      }
    }
    return new Action('or', actions);
  }
}

module.exports = Action;
