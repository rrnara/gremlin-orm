# gremlin-orm

[![Build Status](https://travis-ci.org/gremlin-orm/gremlin-orm.svg?branch=master)](https://travis-ci.org/gremlin-orm/gremlin-orm)
[![Coverage Status](https://coveralls.io/repos/github/gremlin-orm/gremlin-orm/badge.svg?branch=master&update)](https://coveralls.io/github/gremlin-orm/gremlin-orm?branch=master)

gremlin-orm is an ORM for graph databases in Node.js.  Currently working on Neo4j and Microsoft
Azure Cosmos DB with more to come in the future.

## Installation

```bash
$ npm install --save @rrnara/gremlin-orm
```

## Example

```javascript
const genericPool = require('generic-pool');
const GremlinOrm = require('gremlin-orm');
const Gremlin = require('gremlin');
const Action = require('gremlin-orm/Action');
// const g = new gremlinOrm('neo4j'); // connects to localhost:8182 by default

const dbLogger = (msg) => console.log(msg);
const dbErrorLogger = (msg) => console.error(msg);
const factory = {
  create: function() {
    const user = '/dbs/--TESTDB--/colls/--TESTGRAPH--';
    const primaryKey = '--TEST-PRIMARY-KEY--';
    const authenticator = new Gremlin.driver.auth.PlainTextSaslAuthenticator(user, primaryKey);
    const options = {
      authenticator,
      traversalsource: 'g',
      rejectUnauthorized: true,
      mimeType: 'application/vnd.gremlin-v2.0+json'
    };
    const client = new Gremlin.driver.Client('wss://--TEST-COSMOSDB--.gremlin.cosmos.azure.com:443/', options);
    client.addListener('log', dbLogger);
    client.addListener('socketError', dbErrorLogger);
    return client;
  },
  destroy: function(client) {
    client.close();
  }
};
const connectionPool = genericPool.createPool(factory, { min: 0, max: 10, evictionRunIntervalMillis: 120000, idleTimeoutMillis: 230000 });
connectionPool.on('factoryCreateError', dbErrorLogger);
connectionPool.on('factoryDestroyError', dbErrorLogger);
const g = new GremlinOrm(['azure', 'pk', 'test-partition'], connectionPool, true); // Can use dbLogger as parameter instead of true

const Person = g.define(
  'person',
  {
    name: {
      type: g.STRING,
      required: true
    },
    age: {
      type: g.NUMBER
    }
  },
  {
    getDetails: function(suffix) { return `${this.name} ${suffix}, Age ${this.age}`; }
  }
);

Person.create(req.body, (error, result) => {
  if (error) {
    res.send(error);
  }
  else {
    console.log(result.invoke('getDetails', 'Jr'));
    res.send(result);
    // result formatted as nice JSON Object
    /*
      {
        "id": "1",
        "label": "person",
        "name": "Bob",
        "age": 20
      }
    */
  }
});
```

## Documentation

### Initialization

Initialize the gremlin-orm instance with parameters matching the [gremlin-javascript](https://github.com/jbmusso/gremlin-javascript/blob/master/gremlin-client/README.md) `createClient()` initialization - with the addition of the dialect argument.

#### Arguments
* `dialect` (string or Array): Required argument that takes string (`'neo4j'`) or array (`['azure', '<partitionName>', '<defaultPartitionValue>']`).
* `client`: Gremlin Client

### Methods

#### Defining Models
* [define](#define) - alias for defineVertex
* [defineVertex](#defineVertex) - define a new Vertex model
* [defineEdge](#defineEdge) - define a new Edge model

#### Generic Methods
* [query](#query) - run a Gremlin query string on a Model
* [queryRaw](#queryRaw) - perform a raw query on the gremlin-orm root and return raw data
* [update](#update) - update specific props on an existing vertex or edge
* [delete](#delete) - delete an existing vertex or edge
* [order](#order) - order the results by property and asc/desc
* [limit](#limit) - limit the number of results returned
* [range](#range) - Array range of results returned
* [invoke](#invoke) - Invoke methods defined along with schema

#### Vertex Methods
* [create](#create) - create a new vertex
* [find](#find) - find first vertex with matching properties
* [findAll](#findAll) - find all vertices with matching properties
* [findActionAll](#findActionAll) - find all vertices when particular action is applied on the properties
* [createEdge](#createEdge) - define a new edge relationship to another vertex(es)
* [findEdge](#findEdge) - find edges directly connected to the relevant vertex(es)
* [findRelated](#findRelated) - find all vertices connected to initial vertex(es) through a type of edge with optional properties
* [findImplicit](#findImplicit) - find all vertices which have the same edge relations `in` that the current vertex(es) has `out` to another vertex

#### Edge Methods
* [create](#edge-model-create) - create new edge relationship(s) by passing in two vertices or sets of vertices
* [find](#edge-model-find) - find first edge with matching properties
* [findAll](#edge-model-findAll) - find all edges with matching properties
* [findVertex](#findVertex) - find all vertices that are connected by the relevant edges

#### Action Methods
Refer to [Tinkerpop documentation](https://tinkerpop.apache.org/docs/3.4.0/reference/#a-note-on-predicates)
Only custom query option is Or - to perform Or condition queries


## Method Chaining

In order to avoid sacrificing the power of Gremlin traversals, method calls in this ORM can take
advantage of method chaining.  Any read-only method will avoid running its database
query and instead pass its Gremlin query string to the next method in the chain if it is not given a callback.  _Note: All create, update, and delete methods require a callback and can not have more methods chained after._

#### Example

```javascript
  // Only makes one call to the database
  Person.find({'name': 'John'}).findRelated('knows', {'since': '2015'}, (error, result) => {
    // Send people John knows to client
  })
```

Additionally, results returned in the form of JSON objects will retain their relevant model methods for additional queries.

```javascript
  // Makes two calls to the database
  Person.find({'name': 'John'}), (error, result) => {
    let john = result;
    john.findRelated('knows', {'since': '2015'}, (error, result) => {
      // Send people John knows to client
    })
  })
```

## Defining Models

_This ORM utilizes Model definitions similar to [Sequelize](https://github.com/sequelize/sequelize) to add structure to developing servers around graph databases.  Queries outside of the constraints of pre-defined models can be run using the generic [`.query`](#query) or [`.queryRaw`](#queryRaw)._

<a name="define"></a>
### define(label, schema)

`.define` is an alias for defineVertex

<a name="defineVertex"></a>
### defineVertex(label, schema)

`.defineVertex` defines a new instance of the `VertexModel` class - see generic and vertex model methods

##### Arguments
* `label`: Label to be used on all vertices of this model
* `schema`: A schema object which defines allowed property keys and allowed values/types for each key
* `methods`: An object which defines methods that can be called on instance of model

##### Example
```javascript
const Person = g.define(
  'person',
  {
    name: {
      type: g.STRING,
      required: true
    },
    age: {
      type: g.NUMBER
    }
  },
  {
    getDetails: function (suffix) { return `${this.name} ${suffix}, Age ${this.age}`; }
  }
);

```

<a name="defineEdge"></a>
### defineEdge(label, schema)

`.defineEdge` defines a new instance of the `EdgeModel` class - see generic and edge model methods

##### Arguments
* `label`: Label to be used on all edges of this model
* `schema`: A schema object which defines allowed property keys and allowed values/types for each key
* `methods`: An object which defines methods that can be called on instance of model

##### Example
```javascript
const Knows = g.defineEdge(
  'knows',
  {
    from: {
      type: g.STRING
    },
    since: {
      type: g.DATE
    }
  },
  {
    relationshipDetails: function () { return `Since ${this.since}`; }
  }
);
```

#### Model Data types

The following options are available when defining model schemas:
* `type`: Use Sequelize-like constants to define data types. Date properties will be returned as javascript Date objects unless returning raw data.  The following data type constants are currently available with possibly more in the future.
  * `g.STRING`
  * `g.NUMBER`
  * `g.DATE`
  * `g.BOOLEAN`
* `required` (default = false): If true, will not allow saving to database if not present or empty

## Generic Methods
<a name="query"></a>
### query(queryString, [raw, callback])

`.query` takes a raw Gremlin query string and runs it on the object it is called on.

##### Arguments
* `queryString`: Gremlin query as a string
* `raw` (optional, default = false): If true, will return the raw data from the graph database instead of normally formatted JSON
* `callback` (optional, required if raw is true): Some callback function with (error, result) arguments.

##### Returns
* If callback is given, returns **array** where 0th index is array of Vertex results and 1th index is array of Edge results (even if either is empty) -- this helps expose the correct model methods if the query returns edges from a query on a vertex or vis versa.

##### Example
```javascript
  let query =  ".as('a').out('created').as('b').in('created').as('c').dedup('a','b').select('a','b','c')"
  Person.find({'name': 'John'}).query(query, true, (error, result) => {
    // send raw data to client
  });
```

<a name="queryRaw"></a>
### queryRaw(queryString, callback)

`.queryRaw` performs a raw query on the gremlin-orm root and returns raw data

##### Arguments
* `queryString`: Gremlin query as a string
* `callback`: Some callback function with (error, result) arguments

##### Example
```javascript
  // query must be a full Gremlin query string
  let query = "g.V(1).as('a').out('created').as('b').in('created').as('c').dedup('a','b').select('a','b','c')"
  g.queryRaw(query, (error, result) => {
    // send raw data to client
  });
```

<a name="update"></a>
### update({props}, callback)

`.update` takes a properties object and updates the relevant properties on the model instance it is called on.

##### Arguments
* `props`: Object containing key value pairs of properties to update
* `callback`: Some callback function with (error, result) arguments

##### Example
```javascript
  Person.find({'name': 'John'}).update({'age', 30}, (error, result) => {
    // send data to client
  });
```

<a name="delete"></a>
### delete(callback)

`.delete` removes the object(s) it is called on from the database.

##### Arguments
* `callback`: Some callback function with (error, result) arguments

##### Example
```javascript
  Person.find({'name', 'John'}, (error, result) => {
    if (result) result.delete((error, result) => {
      // check if successful delete
    });
  });
```

<a name="order"></a>
### order(property, order, [callback])

`.order` sorts the results by a property in ascending or descending order

##### Arguments
* `property`: Name of property to order by
* `order`: Order to sort - 'ASC' or 'DESC'
* `callback` (optional): Some callback function with (error, result) arguments

##### Example
```javascript
  Person.findAll({'occupation': 'developer'}).order('age', 'DESC', (error, result) => {
    // Return oldest developers first
  });
```

<a name="limit"></a>
### limit(num, [callback])

`.limit` limits the query to only the first `num` objects

##### Arguments
* `num`: Max number of results to return
* `callback` (optional): Some callback function with (error, result) arguments

##### Example
```javascript
  Person.find({'name': 'John'}).findEdge('knows').limit(100, (error, result) => {
    // Return first 100 people that John knows
  });
```

<a name="range"></a>
### range(start, end, [callback])

`.range` Array range of results returned

##### Arguments
* `start`: Starting index of results to return (inclusive)
* `end`: Ending index of results to return (exclusive)
* `callback` (optional): Some callback function with (error, result) arguments

##### Example
```javascript
  Person.find({'name': 'John'}).findEdge('knows').range(20, 40, (error, result) => {
    // Return results 20-39 people that John knows
  });
```

<a name="invoke"></a>
### invoke(methodName, ...args)

`.invoke` takes a method name as key and invokes it with arguments provided.

##### Arguments
* `methodName`: Method name as string key as defined along with schema
* `args` (optional): Arguments to pass to the method

##### Returns
* Same return value as the method invoked

##### Example
```javascript
Person.create(req.body, (error, result) => {
  if (error) {
    res.send(error);
  }
  else {
    console.log(result.invoke('getDetails', 'Jr')); // displays "${result.name} Jr"
  }
});
```

## Vertex Methods

<a name="create"></a>
### create({props}, callback)

`.create` creates a new vertex with properties matching props object

##### Arguments
* `props`: Object containing key value pairs of properties matching defined Model schema
* `callback`: Some callback function with (error, result) arguments

##### Returns
* Returns the newly created vertex object (with a unique ID) or an error object of failed schema checks

##### Example
```javascript
  Person.create({'name': 'John', 'age': 30}, (error, result) => {
    // Returns the newly created vertex
    /*
      {
        "id": "1",
        "label": "person",
        "name": "John",
        "age": 30
      }
    */
  });
```

<a name="find"></a>
### find({props}, [callback])

`.find` finds the first vertex with properties matching props object

##### Arguments
* `props`: Object containing key value pairs of properties
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns the first matching vertex as an object

##### Example
```javascript
  Person.find({'name': 'John'}, (error, result) => {
    // Returns first vertex found matching props
    /*
      {
        "id": "1",
        "label": "person",
        "name": "John",
        "age": 30
      }
    */
  });
```

<a name="findAll"></a>
### findAll({props}, [callback])

`.findAll` finds the all vertices with properties matching props object

##### Arguments
* `props`: Object containing key value pairs of properties
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all vertices matching props as objects

##### Example
```javascript
  Person.findAll({'age': 30}, (error, result) => {
    // Returns array of matching vertices
    /*
      [
        {
          "id": "1",
          "label": "person",
          "name": "John",
          "age": 30
        },
        {
          "id": "2",
          "label": "person",
          "name": "Jane",
          "age": 30
        }
      ]
    */
  });
```

<a name="findActionAll"></a>
### findActionAll({action}, {props}, [callback])

`.findActionAll` find all vertices when particular action is applied on the properties

##### Arguments
* `action`: Action providing context to operation to perform over the props
* `props`: Object containing key value pairs of properties
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all vertices matching props as objects

##### Example
```javascript
  Person.findActionAll(Action.Or, { name: ['Abc', 'Def'], age: 75 }, (error, results) => {
    if (error) {
      console.error(error);
    } else {
      console.log(`Results: ${results.length}`);
      console.log(results);
    }
  })
```

<a name="createEdge"></a>
### createEdge(edge, {props}, vertex, [both,] callback)

`.createEdge` creates new edge relationships from starting vertex(es) to vertex(es) passed in.

##### Arguments
* `edge`: Edge model. If a string label is passed, no schema check will be done - edge model is recommended
* `props`: Object containing key value pairs of properties to place on new edges
* `vertex`: Vertex model instances or vertex model query
* `both` (optional, default = false): If true, will create edges in both directions
* `callback`: Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all new created edges

##### Examples
```javascript
  // Chaining vertex methods
  Person.findAll({'age': 20}).createEdge(Uses, {'frequency': 'daily'}, Website.find({'name': 'Facebook'}), (error, result) => {
    // Result is array of newly created edges from everyone with age 20 to the website 'Facebook'
  });

  // Calling .createEdge on model instances
  Person.findAll({'occupation': 'web developer'}, (error, results) => {
    let developers = results;
    Language.findAll({'name': ['Javascript', 'HTML', 'CSS']}, (error, results) => {
      let languages = results;
      developers.createEdge(Uses, {}, languages, (error, result) => {
        // Result is array of newly created edge objects from each web developers
        // to each of the 3 important components of web development
      });
    });
  });


  // Creating edges both ways
  Person.find({'name': 'Jane'}, (error, result) => {
    let jane = result;
    Person.find({'name' : 'John'}).createEdge(Knows, {since: '1999'}, jane, true, (error, result) => {
      // Creates two edges so that John knows Jane and Jane also knows John
    })
  });
```

<a name="findEdge"></a>
### findEdge(edge, {props}, [callback])

`.findEdge` finds edges directly connected to the relevant vertex(es)

##### Arguments
* `edge`: Edge model. If a string label is passed, no schema check will be done - edge model is recommended
* `props`: Object containing key value pairs of properties to match on edge relationships
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all connected edges

##### Examples
```javascript
Person.find({'name': 'John'}).findEdge(Knows, {'from': 'school'}, (error, result) => {
  // Result is array of edge objects representing all the 'knows' relationships of John
  // where John knows the person from school (edge model property)
});
```

<a name="findRelated"></a>
### findRelated(edge, {props}, depth, [inModel, callback])

`.findRelated` finds vertices related through the desired edge relationship.

##### Arguments
* `edge`: Edge model. If a string label is passed, no schema check will be done - edge model is recommended.
* `props`: Object containing key value pairs of properties to match on edge relationships
* `depth`: Depth of edge traversals to make
* `inModel` (optional, default = `this`): Vertex model of results to find. Can pass a vertex model (`Person`) or label string (`'person'`) -- vertex model is recommended.
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all related vertices

##### Examples
```javascript
Person.find({'name': 'John'}).findRelated(Knows, {}, 2, (error, result) => {
  // Result is array of Person records representing John's friends of friends
});

Person.find({'name': 'John'}).findRelated(Likes, {}, 1, Movie, (error, result) => {
  // Result is array of Movie records that John likes.
});
```

<a name="findImplicit"></a>
### findImplicit(edge, {props}, [callback])

`.findImplicit` finds vertices that are related to another vertex the same way the original vertex is.

##### Arguments
* `edge`: Edge model. If a string label is passed, no schema check will be done - edge model is recommended.
* `props`: Object containing key value pairs of properties to match on edge relationships
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all related vertices

##### Examples
```javascript
Person.find({'name': 'John'}).findImplicit('created', {}, (error, result) => {
  // Result is array of vertex objects representing people who have co-created things that John created
});
```


## Edge Methods

<a name="edge-model-create"></a>
### create(out, in, {props}, callback)

`.create` creates an index from `out` vertex(es) to the `in` vertex(es)

##### Arguments
* `out`: Vertex instance(s) or find/findAll method call
* `in`: Vertex instance(s) or find/findAll method call
* `props`: Object containing key value pairs of properties to add on the new edge
* `both` (optional, default = false): If true, will create edges in both directions
* `callback`: Some callback function with (error, result) arguments

##### Returns
* Returns newly created edge object

##### Examples
```javascript
Person.find({'name': 'Joe'}, (error, result) => {
  let joe = result;
  Knows.create(Person.find({'name': 'John'}), joe, {'since': 2015}, (error, result) => {
    // Returns the newly created edge
    /*
      {
        "id": "1",
        "label": "knows",
        "since": "2015",
        "outV": "1",  // John's id
        "inV": "2",   // Joe's id
      }
    */
  });
});
```

<a name="edge-model-find"></a>
### find({props}, [callback])

`.find` finds the first edge with properties matching props object

##### Arguments
* `props`: Object containing key value pairs of properties
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns the first matching edge as an object

##### Example
```javascript
  Knows.find({'since': 2015}, (error, result) => {
    // Returns first edge found matching props
    /*
      {
        "id": "1",
        "label": "knows",
        "since": 2015,
        "outV": 1,
        "inV": 123
      }
    */
  });
```

<a name="findAll"></a>
### findAll({props}, [callback])

`.findAll` finds the all edges with properties matching props object

##### Arguments
* `props`: Object containing key value pairs of properties
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all edges matching props as objects

##### Example
```javascript
  Knows.findAll({'since': 2015}, (error, result) => {
    // Returns array of matching edges
    /*
      [
        {
          "id": "1",
          "label": "knows",
          "since": 2015,
          "outV": 1,
          "inV": 123
        },
        {
          "id": "2",
          "label": "knows",
          "since": 2015,
          "outV": 1,
          "inV": 200
        }
      ]
    */
  });
```

<a name="findVertex"></a>
### findVertex(vertexModel, {props}, [callback])

`.findVertex` finds the all vertices with properties matching props object connected by the relevant edge(s)

##### Arguments
* `vertexModel`: Vertex model. If a string label is passed, no schema check will be done - vertex model is recommended.
* `props`: Object containing key value pairs of properties to find on vertices
* `callback` (optional): Some callback function with (error, result) arguments

##### Returns
* Returns an array containing all vertices connected by current edge(s)

##### Example
```javascript
Knows.find({'through': 'school'}).findVertex(Person, {'occupation': 'developer'}, (error, result) => {
  // Result is array of people who are developers who know other people through school
});
```

## Action Methods

### P_eq(object)
* `object`: Object to check equality with

### P_neq(object)
* `object`: Object to check inequality with

### P_lt(object)
* `object`: Object to check less than with

### P_lte(object)
* `object`: Object to check less than equal to with

### P_gt(object)
* `object`: Object to check greater than with

### P_gte(object)
* `object`: Object to check greater than equal to with

### P_inside(object1, object2)
* `object1`: Object to check greater than with
* `object2`: Object to check less than with

### P_outside(object1, object2)
* `object1`: Object to check less than with
* `object2`: Object to check greater than with

### P_between(object1, object2)
* `object1`: Object to check greater than equal to with
* `object2`: Object to check less than equal to with

### P_within(objects)
* `objects`: Array to have one of the values

### P_without(objects)
* `objects`: Array to not have the value

### TextP_startingWith(str)
* `str`: String to start with

### TextP_endingWith(str)
* `str`: String to end with

### TextP_containing(str)
* `str`: String contained

### TextP_notStartingWith(str)
* `str`: String to not start with

### TextP_notEndingWith(str)
* `str`: String to not end with

### TextP_notContaining(str)
* `str`: String to not be contained

### Has_And(key, value)
* `key`: key to query over (an array field ideally)
* `value`: An array ideally, where the key needs to contain all the provided values

### Or(props)
* `props`: key/value to perform OR query over

#### Example

Person with age greater than 35

```javascript
  Person.findAll({ age: Action.P_gt(35) }, (error, results) => {
    if (error) {
      console.error(error);
    } else {
      console.log(`Results: ${results.length}`);
      console.log(results);
    }
  })
```

Person with both the tags 'Abc' and 'Def'

```javascript
  Person.findActionAll(Action.Has_And, { tags: ['Abc', 'Def'] }, (error, results) => {
    if (error) {
      console.error(error);
    } else {
      console.log(`Results: ${results.length}`);
      console.log(results);
    }
  })
```

Person with name either 'Abc' or 'Def' or age is 75

```javascript
  Person.findActionAll(Action.Or, { name: ['Abc', 'Def'], age: 75 }, (error, results) => {
    if (error) {
      console.error(error);
    } else {
      console.log(`Results: ${results.length}`);
      console.log(results);
    }
  })
```

## License

This project is licensed under the MIT License

## Resources
[Apache TinkerPop Gremlin Reference](http://tinkerpop.apache.org/docs/3.3.0/reference/)
