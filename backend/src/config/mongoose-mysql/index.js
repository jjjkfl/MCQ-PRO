const mysql = require('mysql2/promise');
const url = require('url');
const crypto = require('crypto');
const EventEmitter = require('events');

let pool = null;
const modelsRegistry = {};

// Custom connection event emitter
const connection = new EventEmitter();
connection.host = 'MySQL-Server';
connection.db = {
  listCollections: function() {
    return {
      toArray: async function() {
        if (!pool) return [];
        const [rows] = await pool.query('SHOW TABLES');
        return rows.map(r => ({ name: Object.values(r)[0] }));
      }
    };
  },
  collection: function(collectionName) {
    return {
      drop: async function() {
        if (!pool) return;
        await pool.query(`DROP TABLE IF EXISTS \`${collectionName}\``);
      },
      insertMany: async function(docs) {
        if (!pool) return;
        for (const doc of docs) {
          const id = doc._id || crypto.randomBytes(12).toString('hex');
          const dataStr = JSON.stringify(doc);
          const now = new Date();
          const createdAt = doc.createdAt ? new Date(doc.createdAt) : now;
          const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : now;
          await pool.query(
            `INSERT INTO \`${collectionName}\` (\`_id\`, \`data\`, \`createdAt\`, \`updatedAt\`) 
             VALUES (?, ?, ?, ?)`,
            [id, dataStr, createdAt, updatedAt]
          );
        }
      },
      updateOne: async function(query, update) {
        let modelClass = null;
        for (const m of Object.values(modelsRegistry)) {
          if (m.tableName === collectionName) {
            modelClass = m;
            break;
          }
        }
        if (modelClass) {
          return modelClass.updateOne(query, update);
        }
        throw new Error(`Collection ${collectionName} not found in mock connection`);
      },
      find: function(query) {
        return {
          toArray: async function() {
            if (!pool) return [];
            const { whereSql, params } = compileQuery(query);
            const sql = `SELECT * FROM \`${collectionName}\` WHERE ${whereSql}`;
            const [rows] = await pool.query(sql, params);
            return rows.map(row => {
              let docObj;
              try {
                docObj = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
              } catch (e) {
                docObj = {};
              }
              docObj._id = row._id;
              docObj.createdAt = row.createdAt;
              docObj.updatedAt = row.updatedAt;
              return docObj;
            });
          }
        };
      }
    };
  }
};

function parseUri(uri) {
  if (uri.startsWith('mysql://')) {
    const parsed = new url.URL(uri);
    return {
      host: parsed.hostname,
      port: parsed.port || 3306,
      user: parsed.username,
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.substring(1),
      multipleStatements: true
    };
  }
  return null;
}

async function connect(uri) {
  const config = parseUri(uri);
  if (!config) {
    throw new Error(`Invalid MySQL connection URI: ${uri}. Make sure MONGO_URI is set to a mysql:// URL.`);
  }

  // First connect without database to ensure it exists
  const tempConfig = { ...config };
  delete tempConfig.database;
  
  let tempConn;
  try {
    tempConn = await mysql.createConnection(tempConfig);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
    await tempConn.end();
  } catch (err) {
    // If it's access denied to server, throw it
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      throw err;
    }
    console.warn("Warning: Could not auto-create database (might exist or insufficient privileges):", err.message);
    if (tempConn) await tempConn.end();
  }

  // Pre-load all model files to register them in modelsRegistry
  const fs = require('fs');
  const path = require('path');
  const modelsDir = path.join(__dirname, '..', '..', 'models');
  if (fs.existsSync(modelsDir)) {
    const files = fs.readdirSync(modelsDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          require(path.join(modelsDir, file));
        } catch (e) {
          // ignore or log
        }
      }
    }
  }

  pool = mysql.createPool(config);

  // Auto-create tables for all registered models
  for (const [modelName, ModelClass] of Object.entries(modelsRegistry)) {
    const tableName = ModelClass.tableName;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        \`_id\` VARCHAR(24) PRIMARY KEY,
        \`data\` JSON NOT NULL,
        \`createdAt\` DATETIME,
        \`updatedAt\` DATETIME
      ) ENGINE=InnoDB;
    `);
  }
  
  // Trigger connected event
  connection.emit('connected');

  return {
    connection: connection
  };
}

async function disconnect() {
  if (pool) {
    await pool.end();
  }
}

class Schema {
  constructor(definition, options) {
    this.definition = definition || {};
    this.options = options || {};
    this.methods = {};
    this.statics = {};
    this._preHooks = {};
    this._postHooks = {};
  }
  pre(hookName, fn) {
    this._preHooks[hookName] = this._preHooks[hookName] || [];
    this._preHooks[hookName].push(fn);
  }
  post(hookName, fn) {
    this._postHooks[hookName] = this._postHooks[hookName] || [];
    this._postHooks[hookName].push(fn);
  }
  index(fields, options) {
    // no-op
  }
  plugin(fn, options) {
    if (typeof fn === 'function') {
      fn(this, options);
    }
  }
}
Schema.Types = {
  ObjectId: 'ObjectId',
  Mixed: 'Mixed',
  Boolean: 'Boolean',
  String: 'String',
  Number: 'Number',
  Date: 'Date'
};

function ObjectId(id) {
  if (!(this instanceof ObjectId)) {
    return new ObjectId(id);
  }
  this.id = id ? String(id) : crypto.randomBytes(12).toString('hex');
}
ObjectId.prototype.toString = function() {
  return this.id;
};
ObjectId.isValid = function(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
};

function castValue(val, type) {
  if (val === null || val === undefined) return val;
  if (type === Date || type === 'Date') {
    return new Date(val);
  }
  if (type === String || type === 'String') {
    return String(val);
  }
  if (type === Number || type === 'Number') {
    return Number(val);
  }
  if (type === Boolean || type === 'Boolean') {
    return Boolean(val);
  }
  return val;
}

class Model {
  constructor(data) {
    this._doc = data || {};
    this.isNew = !data || !data._id;

    // Apply defaults and type casting from schema
    const schema = this.constructor.schema;
    if (schema && schema.definition) {
      for (const [key, fieldDef] of Object.entries(schema.definition)) {
        let type = null;
        let defVal = undefined;

        if (fieldDef) {
          if (typeof fieldDef === 'function') {
            type = fieldDef;
          } else {
            type = fieldDef.type;
            defVal = fieldDef.default;
          }
        }

        // Apply default if undefined
        if (this._doc[key] === undefined && defVal !== undefined && this.isNew) {
          const val = typeof defVal === 'function' ? defVal() : defVal;
          this._doc[key] = val;
        }

        // Cast type
        if (this._doc[key] !== undefined && type) {
          this._doc[key] = castValue(this._doc[key], type);
        }
      }
    }

    Object.assign(this, this._doc);
    this._initialDoc = JSON.parse(JSON.stringify(this._doc));

    // Bind methods
    if (schema && schema.methods) {
      for (const [methodName, methodFn] of Object.entries(schema.methods)) {
        this[methodName] = methodFn.bind(this);
      }
    }
  }

  isModified(path) {
    if (this.isNew) return true;
    return JSON.stringify(this[path]) !== JSON.stringify(this._initialDoc[path]);
  }

  async save() {
    const schema = this.constructor.schema;
    
    // Run pre-save hooks
    if (schema && schema._preHooks && schema._preHooks.save) {
      for (const fn of schema._preHooks.save) {
        // Mongoose hooks take 'next' or return Promise
        await new Promise((resolve, reject) => {
          const result = fn.call(this, (err) => {
            if (err) reject(err);
            else resolve();
          });
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else if (fn.length === 0) {
            resolve();
          }
        });
      }
    }

    // Update _doc with any changes made to `this` properties
    const schemaKeys = Object.keys(schema.definition);
    for (const key of schemaKeys) {
      if (this[key] !== undefined) {
        this._doc[key] = this[key];
      }
    }

    if (!this._doc._id) {
      this._doc._id = crypto.randomBytes(12).toString('hex');
    }
    this._id = this._doc._id;

    const now = new Date();
    if (schema.options.timestamps) {
      if (!this._doc.createdAt) this._doc.createdAt = now;
      this._doc.updatedAt = now;
    }

    const id = this._doc._id;
    const dataStr = JSON.stringify(this._doc);
    const createdAt = this._doc.createdAt || now;
    const updatedAt = this._doc.updatedAt || now;

    const tableName = this.constructor.tableName;
    await pool.query(
      `INSERT INTO \`${tableName}\` (\`_id\`, \`data\`, \`createdAt\`, \`updatedAt\`) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE \`data\` = ?, \`updatedAt\` = ?`,
      [id, dataStr, createdAt, updatedAt, dataStr, updatedAt]
    );

    this.isNew = false;
    this._initialDoc = JSON.parse(JSON.stringify(this._doc));
    return this;
  }

  async updateFields(update) {
    const schema = this.constructor.schema;
    const newDoc = { ...this._doc };

    if (update.$set) {
      Object.assign(newDoc, update.$set);
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        delete newDoc[k];
      }
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        newDoc[k] = Array.isArray(newDoc[k]) ? newDoc[k] : [];
        if (v && v.$each) {
          newDoc[k].push(...v.$each);
        } else {
          newDoc[k].push(v);
        }
      }
    }
    if (update.$addToSet) {
      for (const [k, v] of Object.entries(update.$addToSet)) {
        newDoc[k] = Array.isArray(newDoc[k]) ? newDoc[k] : [];
        const valStr = String(v);
        const exists = newDoc[k].some(item => String(item) === valStr);
        if (!exists) {
          newDoc[k].push(v);
        }
      }
    }
    if (update.$pull) {
      for (const [k, v] of Object.entries(update.$pull)) {
        if (Array.isArray(newDoc[k])) {
          const valStr = String(v);
          newDoc[k] = newDoc[k].filter(item => String(item) !== valStr);
        }
      }
    }

    const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
    if (!hasOperators) {
      Object.assign(newDoc, update);
    }

    this._doc = newDoc;
    Object.assign(this, newDoc);
    await this.save();
  }

  toObject() {
    return JSON.parse(JSON.stringify(this._doc));
  }
  toJSON() {
    return this.toObject();
  }
}

class Query {
  constructor(modelClass, queryOptions, singleResult = false) {
    this.modelClass = modelClass;
    this.queryOptions = queryOptions || {};
    this.singleResult = singleResult;
    this._selectFields = null;
    this._sortOptions = null;
    this._limitVal = null;
    this._populatePaths = [];
    this._isLean = false;
  }

  select(fields) {
    this._selectFields = fields;
    return this;
  }

  sort(sortOptions) {
    this._sortOptions = sortOptions;
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  lean() {
    this._isLean = true;
    return this;
  }

  populate(path, select) {
    if (typeof path === 'object') {
      this._populatePaths.push(path);
    } else {
      this._populatePaths.push({ path, select });
    }
    return this;
  }

  async then(resolve, reject) {
    try {
      const res = await this.exec();
      resolve(res);
    } catch (err) {
      reject(err);
    }
  }

  async exec() {
    const { whereSql, params } = compileQuery(this.queryOptions);
    const tableName = this.modelClass.tableName;

    let sql = `SELECT * FROM \`${tableName}\` WHERE ${whereSql}`;

    if (this._sortOptions) {
      let sortParts = [];
      if (typeof this._sortOptions === 'string') {
        const parts = this._sortOptions.split(/\s+/);
        for (const p of parts) {
          if (p.startsWith('-')) {
            const field = p.substring(1);
            if (field === 'createdAt' || field === 'updatedAt') {
              sortParts.push(`\`${field}\` DESC`);
            } else {
              sortParts.push(`JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${field}')) DESC`);
            }
          } else {
            const field = p;
            if (field === 'createdAt' || field === 'updatedAt') {
              sortParts.push(`\`${field}\` ASC`);
            } else {
              sortParts.push(`JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${field}')) ASC`);
            }
          }
        }
      } else if (typeof this._sortOptions === 'object') {
        for (const [key, val] of Object.entries(this._sortOptions)) {
          const dir = val === -1 || val === 'desc' ? 'DESC' : 'ASC';
          if (key === 'createdAt' || key === 'updatedAt') {
            sortParts.push(`\`${key}\` ${dir}`);
          } else {
            sortParts.push(`JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${key}')) ${dir}`);
          }
        }
      }
      if (sortParts.length > 0) {
        sql += ` ORDER BY ${sortParts.join(', ')}`;
      }
    }

    if (this._limitVal !== null && this._limitVal !== undefined) {
      sql += ` LIMIT ${Number(this._limitVal)}`;
    }

    const [rows] = await pool.query(sql, params);

    let results = rows.map(row => {
      let docObj;
      try {
        docObj = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch (e) {
        docObj = {};
      }
      docObj._id = row._id;
      docObj.createdAt = row.createdAt;
      docObj.updatedAt = row.updatedAt;
      return docObj;
    });

    if (this.singleResult) {
      if (results.length === 0) return null;
      results = results[0];
    }

    if (this._populatePaths.length > 0) {
      if (this.singleResult) {
        if (results) {
          await this._populateDoc(results);
        }
      } else {
        for (const doc of results) {
          await this._populateDoc(doc);
        }
      }
    }

    if (this._selectFields) {
      if (this.singleResult) {
        if (results) {
          results = filterFields(results, this._selectFields);
        }
      } else {
        results = results.map(doc => filterFields(doc, this._selectFields));
      }
    }

    if (this._isLean) {
      return results;
    } else {
      if (this.singleResult) {
        return results ? new this.modelClass(results) : null;
      } else {
        return results.map(doc => new this.modelClass(doc));
      }
    }
  }

  async _populateDoc(doc) {
    for (const pop of this._populatePaths) {
      const path = pop.path;
      const val = doc[path];
      if (!val) continue;

      const schemaField = this.modelClass.schema.definition[path];
      let refModelName = null;
      let isArray = false;

      if (schemaField) {
        if (Array.isArray(schemaField)) {
          if (schemaField[0] && schemaField[0].ref) {
            refModelName = schemaField[0].ref;
            isArray = true;
          }
        } else if (schemaField.ref) {
          refModelName = schemaField.ref;
        }
      }

      if (!refModelName) continue;
      const RefModel = modelsRegistry[refModelName];
      if (!RefModel) continue;

      if (isArray && Array.isArray(val)) {
        const populatedItems = [];
        for (const id of val) {
          const item = await RefModel.findById(id).lean();
          if (item) {
            populatedItems.push(filterFields(item, pop.select));
          }
        }
        doc[path] = populatedItems;
      } else {
        const item = await RefModel.findById(val).lean();
        if (item) {
          doc[path] = filterFields(item, pop.select);
        } else {
          doc[path] = null;
        }
      }
    }
  }
}

function model(name, schema) {
  if (modelsRegistry[name]) {
    return modelsRegistry[name];
  }

  const pluralName = name.toLowerCase() + 's';

  class CustomModel extends Model {}
  CustomModel.schema = schema;
  CustomModel.tableName = pluralName;
  CustomModel.modelName = name;

  // Create table dynamically if connection pool is already active
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS \`${pluralName}\` (
        \`_id\` VARCHAR(24) PRIMARY KEY,
        \`data\` JSON NOT NULL,
        \`createdAt\` DATETIME,
        \`updatedAt\` DATETIME
      ) ENGINE=InnoDB;
    `).catch(err => console.error(`Failed to create table ${pluralName} on demand:`, err.message));
  }

  CustomModel.create = async function(docOrDocs) {
    if (Array.isArray(docOrDocs)) {
      const instances = [];
      for (const doc of docOrDocs) {
        const inst = new CustomModel(doc);
        await inst.save();
        instances.push(inst);
      }
      return instances;
    } else {
      const inst = new CustomModel(docOrDocs);
      await inst.save();
      return inst;
    }
  };

  CustomModel.find = function(query) {
    return new Query(CustomModel, query, false);
  };
  CustomModel.findOne = function(query) {
    return new Query(CustomModel, query, true);
  };
  CustomModel.findById = function(id) {
    return new Query(CustomModel, { _id: id }, true);
  };
  CustomModel.countDocuments = async function(query) {
    if (!pool) return 0;
    const { whereSql, params } = compileQuery(query);
    const sql = `SELECT COUNT(*) AS count FROM \`${CustomModel.tableName}\` WHERE ${whereSql}`;
    const [rows] = await pool.query(sql, params);
    return rows[0].count;
  };
  CustomModel.updateOne = async function(query, update) {
    // Run updateOne pre-hooks if any
    if (schema && schema._preHooks && schema._preHooks.updateOne) {
      for (const fn of schema._preHooks.updateOne) {
        fn.call(this);
      }
    }
    const doc = await CustomModel.findOne(query);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    await doc.updateFields(update);
    return { matchedCount: 1, modifiedCount: 1 };
  };
  CustomModel.updateMany = async function(query, update) {
    if (schema && schema._preHooks && schema._preHooks.updateMany) {
      for (const fn of schema._preHooks.updateMany) {
        fn.call(this);
      }
    }
    const docs = await CustomModel.find(query);
    for (const doc of docs) {
      await doc.updateFields(update);
    }
    return { matchedCount: docs.length, modifiedCount: docs.length };
  };
  CustomModel.findByIdAndUpdate = async function(id, update, options) {
    if (schema && schema._preHooks && schema._preHooks.findOneAndUpdate) {
      for (const fn of schema._preHooks.findOneAndUpdate) {
        fn.call(this);
      }
    }
    const doc = await CustomModel.findById(id);
    if (!doc) return null;
    await doc.updateFields(update);
    return doc;
  };
  CustomModel.findByIdAndDelete = async function(id) {
    const [res] = await pool.query(`DELETE FROM \`${CustomModel.tableName}\` WHERE \`_id\` = ?`, [id]);
    return res.affectedRows > 0 ? { _id: id } : null;
  };
  CustomModel.deleteOne = async function(query) {
    const doc = await CustomModel.findOne(query);
    if (!doc) return { deletedCount: 0 };
    await pool.query(`DELETE FROM \`${CustomModel.tableName}\` WHERE \`_id\` = ?`, [doc._id]);
    return { deletedCount: 1 };
  };
  CustomModel.deleteMany = async function(query) {
    const docs = await CustomModel.find(query);
    if (docs.length === 0) return { deletedCount: 0 };
    const ids = docs.map(d => d._id);
    const placeholders = ids.map(() => '?').join(', ');
    await pool.query(`DELETE FROM \`${CustomModel.tableName}\` WHERE \`_id\` IN (${placeholders})`, ids);
    return { deletedCount: docs.length };
  };
  
  CustomModel.aggregate = async function(pipeline) {
    let data = [];
    const matchStage = pipeline.find(stage => stage.$match);
    if (matchStage) {
      const QueryBuilder = new Query(CustomModel, matchStage.$match);
      QueryBuilder.lean();
      data = await QueryBuilder.exec();
    } else {
      const QueryBuilder = new Query(CustomModel, {});
      QueryBuilder.lean();
      data = await QueryBuilder.exec();
    }

    for (const stage of pipeline) {
      if (stage.$match) continue;
      
      if (stage.$lookup) {
        const { from, localField, foreignField, as } = stage.$lookup;
        let refModel = null;
        for (const m of Object.values(modelsRegistry)) {
          if (m.tableName === from) {
            refModel = m;
            break;
          }
        }
        if (refModel) {
          for (const item of data) {
            const lVal = item[localField];
            if (lVal) {
              const matches = await refModel.find({ [foreignField]: lVal }).lean();
              item[as] = matches;
            } else {
              item[as] = [];
            }
          }
        }
      }
      
      if (stage.$unwind) {
        let path = stage.$unwind;
        let preserve = false;
        if (typeof path === 'object') {
          preserve = path.preserveNullAndEmptyArrays;
          path = path.path;
        }
        if (path.startsWith('$')) path = path.substring(1);

        const unwound = [];
        for (const item of data) {
          const val = item[path];
          if (Array.isArray(val) && val.length > 0) {
            for (const sub of val) {
              const copy = JSON.parse(JSON.stringify(item));
              copy[path] = sub;
              unwound.push(copy);
            }
          } else if (val && !Array.isArray(val)) {
            unwound.push(item);
          } else {
            if (preserve) {
              const copy = JSON.parse(JSON.stringify(item));
              copy[path] = null;
              unwound.push(copy);
            }
          }
        }
        data = unwound;
      }
      
      if (stage.$addFields) {
        for (const [newField, expr] of Object.entries(stage.$addFields)) {
          for (const item of data) {
            item[newField] = evaluateExpr(expr, item);
          }
        }
      }
      
      if (stage.$group) {
        const { _id, ...groupOps } = stage.$group;
        const groups = {};
        for (const item of data) {
          const groupId = evaluateExpr(_id, item);
          const groupKey = groupId === null ? 'null' : String(groupId);
          if (!groups[groupKey]) {
            groups[groupKey] = { idVal: groupId, items: [] };
          }
          groups[groupKey].items.push(item);
        }

        const groupedData = [];
        for (const g of Object.values(groups)) {
          const res = { _id: g.idVal };
          for (const [outField, opObj] of Object.entries(groupOps)) {
            const [op, expr] = Object.entries(opObj)[0];
            if (op === '$avg') {
              const vals = g.items.map(item => evaluateExpr(expr, item)).filter(v => typeof v === 'number');
              res[outField] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            } else if (op === '$sum') {
              if (expr === 1) {
                res[outField] = g.items.length;
              } else {
                const vals = g.items.map(item => evaluateExpr(expr, item)).filter(v => typeof v === 'number');
                res[outField] = vals.reduce((a, b) => a + b, 0);
              }
            }
          }
          groupedData.push(res);
        }
        data = groupedData;
      }
      
      if (stage.$project) {
        const proj = stage.$project;
        data = data.map(item => {
          const res = {};
          for (const [k, v] of Object.entries(proj)) {
            if (v === 1 || v === true) {
              res[k] = item[k];
            } else if (v === 0 || v === false) {
              // skip
            } else {
              res[k] = evaluateExpr(v, item);
            }
          }
          if (proj._id === 0) delete res._id;
          return res;
        });
      }
      
      if (stage.$sort) {
        const sortObj = stage.$sort;
        data.sort((a, b) => {
          for (const [k, dir] of Object.entries(sortObj)) {
            const valA = a[k];
            const valB = b[k];
            if (valA < valB) return dir === -1 ? 1 : -1;
            if (valA > valB) return dir === -1 ? -1 : 1;
          }
          return 0;
        });
      }
    }

    return data;
  };

  modelsRegistry[name] = CustomModel;
  return CustomModel;
}

function getPath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function evaluateExpr(expr, item) {
  if (expr === null || expr === undefined) return null;
  if (typeof expr === 'string') {
    if (expr.startsWith('$')) {
      const path = expr.substring(1);
      return getPath(item, path);
    }
    return expr;
  }
  if (typeof expr !== 'object') {
    return expr;
  }
  if (Array.isArray(expr)) {
    return expr.map(sub => evaluateExpr(sub, item));
  }

  const keys = Object.keys(expr);
  if (keys.length === 1) {
    const op = keys[0];
    const val = expr[op];
    if (op === '$cond') {
      let condIf, condThen, condElse;
      if (Array.isArray(val)) {
        [condIf, condThen, condElse] = val;
      } else {
        condIf = val.if;
        condThen = val.then;
        condElse = val.else;
      }
      const isTrue = evaluateExpr(condIf, item);
      return isTrue ? evaluateExpr(condThen, item) : evaluateExpr(condElse, item);
    }
    if (op === '$and') {
      return val.every(sub => !!evaluateExpr(sub, item));
    }
    if (op === '$ne') {
      const [left, right] = val;
      const leftVal = evaluateExpr(left, item);
      const rightVal = evaluateExpr(right, item);
      return leftVal !== rightVal;
    }
    if (op === '$gte') {
      const [left, right] = val;
      return evaluateExpr(left, item) >= evaluateExpr(right, item);
    }
    if (op === '$lt') {
      const [left, right] = val;
      return evaluateExpr(left, item) < evaluateExpr(right, item);
    }
    if (op === '$round') {
      const [numExpr, placesExpr] = val;
      const num = evaluateExpr(numExpr, item);
      const places = evaluateExpr(placesExpr, item) || 0;
      if (typeof num !== 'number') return 0;
      const factor = Math.pow(10, places);
      return Math.round(num * factor) / factor;
    }
  }
  return expr;
}

function compileQuery(query) {
  if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
    return { whereSql: '1=1', params: [] };
  }

  const conditions = [];
  const params = [];

  for (const [key, val] of Object.entries(query)) {
    if (key === '$or' && Array.isArray(val)) {
      const orConditions = [];
      for (const subQuery of val) {
        const { whereSql, params: subParams } = compileQuery(subQuery);
        orConditions.push(`(${whereSql})`);
        params.push(...subParams);
      }
      conditions.push(`(${orConditions.join(' OR ')})`);
      continue;
    }
    if (key === '$and' && Array.isArray(val)) {
      const andConditions = [];
      for (const subQuery of val) {
        const { whereSql, params: subParams } = compileQuery(subQuery);
        andConditions.push(`(${whereSql})`);
        params.push(...subParams);
      }
      conditions.push(`(${andConditions.join(' AND ')})`);
      continue;
    }

    const isId = key === '_id';
    const jsonPath = isId ? '`_id`' : `JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${key}'))`;
    const rawJsonExtract = isId ? '`_id`' : `JSON_EXTRACT(\`data\`, '$.${key}')`;

    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      for (const [op, opVal] of Object.entries(val)) {
        if (op === '$ne') {
          if (isId) {
            conditions.push('`_id` != ?');
            params.push(opVal);
          } else {
            conditions.push(`(${jsonPath} != ? OR ${rawJsonExtract} IS NULL)`);
            params.push(opVal);
          }
        } else if (op === '$in') {
          if (!Array.isArray(opVal) || opVal.length === 0) {
            conditions.push('1=0');
          } else {
            const placeholders = opVal.map(() => '?').join(', ');
            conditions.push(`${jsonPath} IN (${placeholders})`);
            params.push(...opVal.map(v => String(v)));
          }
        } else if (op === '$nin') {
          if (!Array.isArray(opVal) || opVal.length === 0) {
            conditions.push('1=1');
          } else {
            const placeholders = opVal.map(() => '?').join(', ');
            conditions.push(`(${jsonPath} NOT IN (${placeholders}) OR ${rawJsonExtract} IS NULL)`);
            params.push(...opVal.map(v => String(v)));
          }
        } else if (op === '$gte') {
          conditions.push(`${jsonPath} >= ?`);
          params.push(String(opVal));
        } else if (op === '$lte') {
          conditions.push(`${jsonPath} <= ?`);
          params.push(String(opVal));
        } else if (op === '$gt') {
          conditions.push(`${jsonPath} > ?`);
          params.push(String(opVal));
        } else if (op === '$lt') {
          conditions.push(`${jsonPath} < ?`);
          params.push(String(opVal));
        }
      }
    } else {
      if (isId) {
        conditions.push('`_id` = ?');
        params.push(String(val));
      } else if (val === null) {
        conditions.push(`(${jsonPath} IS NULL OR ${rawJsonExtract} IS NULL)`);
      } else {
        const searchVal = val instanceof Date ? val.toISOString() : val;
        conditions.push(`(${jsonPath} = ? OR (JSON_TYPE(${rawJsonExtract}) = 'ARRAY' AND JSON_CONTAINS(${rawJsonExtract}, ?)))`);
        params.push(String(searchVal));
        params.push(JSON.stringify(searchVal));
      }
    }
  }

  return {
    whereSql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params
  };
}

function filterFields(doc, selectFields) {
  if (!selectFields) return doc;
  const newDoc = { ...doc };
  if (typeof selectFields === 'string') {
    const parts = selectFields.trim().split(/\s+/);
    const exclude = parts.some(p => p.startsWith('-'));
    if (exclude) {
      for (const p of parts) {
        if (p.startsWith('-')) {
          delete newDoc[p.substring(1)];
        }
      }
    } else {
      const keysToKeep = new Set(parts);
      keysToKeep.add('_id');
      for (const key of Object.keys(newDoc)) {
        if (!keysToKeep.has(key)) {
          delete newDoc[key];
        }
      }
    }
  } else if (typeof selectFields === 'object') {
    const keys = Object.keys(selectFields);
    const exclude = selectFields[keys[0]] === 0;
    if (exclude) {
      for (const key of keys) {
        if (selectFields[key] === 0) {
          delete newDoc[key];
        }
      }
    } else {
      const keysToKeep = new Set(keys);
      keysToKeep.add('_id');
      for (const key of Object.keys(newDoc)) {
        if (!keysToKeep.has(key)) {
          delete newDoc[key];
        }
      }
    }
  }
  return newDoc;
}

function set(key, val) {
  // strictQuery no-op
}

module.exports = {
  connect,
  disconnect,
  Schema,
  model,
  Types: { ObjectId },
  connection,
  set
};
