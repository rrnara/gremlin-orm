/* eslint-disable camelcase */
class Predicate {
  constructor(operation, params) {
    this.operation = operation;
    this.params = params;
  }

  getGremlinStr() {
    const paramsToUse = Array.isArray(this.params) ? this.params : [this.params];
    const gremlinStr = paramsToUse.map(p => Predicate.stringifyValue(p)).join(',');
    return `${this.operation}(${gremlinStr})`;
  }

  static stringifyValue(value) {
    if (value instanceof Predicate) {
      return value.getGremlinStr();
    } else if (typeof value === 'string') {
      return `'${value}'`;
    } else {
      return `${value}`;
    }
  }

  static P_eq(object) {
    return new Predicate('eq', object);
  }

  static P_neq(object) {
    return new Predicate('neq', object);
  }

  static P_lt(object) {
    return new Predicate('lt', object);
  }

  static P_lte(object) {
    return new Predicate('lte', object);
  }

  static P_gt(object) {
    return new Predicate('gt', object);
  }

  static P_gte(object) {
    return new Predicate('gte', object);
  }

  static P_inside(object1, object2) {
    return new Predicate('inside', [object1, object2]);
  }

  static P_outside(object1, object2) {
    return new Predicate('outside', [object1, object2]);
  }

  static P_between(object1, object2) {
    return new Predicate('between', [object1, object2]);
  }

  static P_within(objects) {
    return new Predicate('within', objects);
  }

  static P_without(objects) {
    return new Predicate('without', objects);
  }

  static TextP_startingWith(str) {
    return new Predicate('TextP.startingWith', str);
  }

  static TextP_endingWith(str) {
    return new Predicate('TextP.endingWith', str);
  }

  static TextP_containing(str) {
    return new Predicate('TextP.containing', str);
  }

  static TextP_notStartingWith(str) {
    return new Predicate('TextP.notStartingWith', str);
  }

  static TextP_notEndingWith(str) {
    return new Predicate('TextP.notEndingWith', str);
  }

  static TextP_notContaining(str) {
    return new Predicate('TextP.notContaining', str);
  }
}

module.exports = Predicate;
