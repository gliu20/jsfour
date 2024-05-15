/**
 * Defines basic instructions that we can compile down to.
 * Bytecode is the jsf subset [=+]
 */

// Defines the types that operators return and accept
const T_Addressable = "T_Addressable";
const T_Addressed = "T_Addressed";
const T_Array = "T_Array";
const T_Number = "T_Number";
const T_String = "T_String";
const T_Boolean = "T_Boolean";
const T_Any = "T_Any";

// Lets values masquerade as a different type. Useful for getting around
// incorrect type checks, though best practice is to make compiler better aware
// of types
const T_MasqType = (def, type) => (def.types.push(type), def);

const expectTypeOf = (expectedType, actualTypes, forVar) => {
  if (!actualTypes.includes(expectedType))
    throw new TypeError(
      `Expected ${expectedType} for ${forVar} but got '${actualTypes}'`
    );
}


// prob want to implement as system of taints
// tainting by addressable
// tainting by non addressable
// etc.


// Define basic ops
//  Op_Array       - [<any>?]              returns T_Array, T_Addressable, T_Any
//  Op_Index       - <addressable>[<any>]  returns T_Addressed, T_Any
//  Op_CastNumber  - +<addressable>        returns T_Number, T_Any
//  Op_Increment   - ++<addressed>         returns T_Number, T_Any
//  Op_Join        - <addressable>+<addressable> returns T_String, T_Number, T_Any
//  Op_Assign      - <addressed>=<any>     returns T_Any
//  Op_AddAssign   - <addressed>+=<any>    returns T_String, T_Number, T_Any
//  Op_IsEqual     - <any>==<any>          returns T_Boolean, T_Any

const memoize = (func) => (() => {
  let store;
  return () => {
    if (!store) return store = func();
    return store;
  }
})();

const buildTemplater = (template) => ({
  compile: template("compile"),
  peek: template("peek"),
  eval: () => eval(template("peek")()),
});


// default objs

/*
{
  types: [T_Any], 
  meta: {
    from: null,
    latentTypes: [],
    latentMeta: {},
  },
  compile: () => '', 
  peek: () => ''
}
*/

const Op_Array = (inner = {
  types: [T_Any],
  compile: () => '',
  peek: () => ''
}) => {
  const template = ($) => () => `[${inner[$]()}]`;

  expectTypeOf(T_Any, inner.types, "inner");

  return {
    types: [T_Array, T_Addressable, T_Any],
    meta: {
      from: Op_Array,
      latentTypes: inner.types,
      latentMeta: inner.meta ?? null,
    },
    ...buildTemplater(template),
  };
}

const Op_Index = (addressable, index) => {
  const template = ($) => () => `${addressable[$]()}[${index[$]()}]`;
  const additionalTypes = [];

  // T_Addressable only comes from Op_Array or Op_Index
  // so we expect it to be self contained
  expectTypeOf(T_Addressable, addressable.types, "addressable");
  expectTypeOf(T_Any, index.types, "index");

  // This handles when strings are grouped, they can be addressable
  if (addressable?.meta?.latentTypes &&
    addressable?.meta?.latentTypes.includes(T_String))
    additionalTypes.push(T_Addressable);

  return {
    types: [T_Addressed, T_Any, ...addressable?.meta?.latentTypes,
      ...additionalTypes],
    meta: {
      from: Op_Index,
      latentTypes: addressable?.meta?.latentTypes ?? [],
      latentMeta: addressable?.meta?.latentMeta ?? null,
    },
    ...buildTemplater(template),
  };
}


const Op_CastNumber = (numberLike) => {
  const template = ($) => () => `+${numberLike[$]()}`;

  // T_Addressable, T_Addressed only comes from Op_Array or Op_Index
  // so we expect it to be self contained
  if (!numberLike.types.includes(T_Addressable) &&
    !numberLike.types.includes(T_Addressed)) {
    expectTypeOf(T_Addressable, numberLike.types, "numberLike");
    expectTypeOf(T_Addressed, numberLike.types, "numberLike");
  }

  return {
    types: [T_Number, T_Any],
    meta: {
      from: Op_CastNumber,
      latentTypes: [],
      latentMeta: null,
    },
    ...buildTemplater(template),
  };
}


const Op_Increment = (number) => {
  const template = ($) => () => `++${number[$]()}`;

  // T_Addressed can only come from indexed expr, so is self-contained
  expectTypeOf(T_Addressed, number.types, "number");
  expectTypeOf(T_Number, number.types, "number");

  return {
    types: [T_Number, T_Any],
    meta: {
      from: Op_Increment,
      latentTypes: [],
      latentMeta: null,
    },
    ...buildTemplater(template),
  };
}

const Op_Join = (a, b) => {
  const template = ($) => () => `${a[$]()}+${b[$]()}`;

  expectTypeOf(T_Any, a.types, "a");
  expectTypeOf(T_Any, b.types, "b");

  if (b.peek().startsWith('+'))
    throw new Error(
      `Cannot join b. '${b.peek().substr(0, 10)}...' cannot start with +.`
    );

  if (a.meta.from === Op_Assign ||
    a.meta.from === Op_AddAssign ||
    a.meta.from === Op_IsEqual ||
    b.meta.from === Op_Assign ||
    b.meta.from === Op_AddAssign ||
    b.meta.from === Op_IsEqual)
    throw new Error(
      `Join not combinable with Op_Assign, Op_AddAssign, or Op_IsEqual.`
    );

  const isNumberLike = (types) =>
    (types.includes(T_Number) || types.includes(T_Boolean));
  const bothNumberLikes = isNumberLike(a.types) &&
    isNumberLike(b.types);

  return {
    types: bothNumberLikes ? [T_Number, T_Any] : [T_String, T_Any],
    meta: {
      from: Op_Join,
      latentTypes: [],
      latentMeta: null,
    },
    ...buildTemplater(template),
  };
}

const Op_Assign = (addressable, assignee) => {
  const template = ($) => () => `${addressable[$]()}=${assignee[$]()}`;

  // T_Addressable only comes from Op_Array or Op_Index
  // so we expect it to be self contained
  expectTypeOf(T_Addressable, addressable.types, "addressable");
  expectTypeOf(T_Any, assignee.types, "assignee");

  return {
    types: [T_Any, ...assignee.types],
    meta: {
      from: Op_Assign,
      latentTypes: assignee?.meta?.latentTypes ?? [],
      latentMeta: assignee?.meta?.latentMeta ?? null,
    },
    ...buildTemplater(template),
  };
}

const Op_AddAssign = () => {
  // the problem with this operator is the inherent difficulty
  // of tracking the types assigned and its movement throughout
  // so we dont implement this, and if this is needed, typechecking deferred
  // to programmer
  throw new Error(`Op_AddAssign not implemented`);
}

const Op_IsEqual = (a, b) => {
  const template = ($) => () => `${a[$]()}==${b[$]()}`;

  expectTypeOf(T_Any, a.types, "a");
  expectTypeOf(T_Any, b.types, "b");

  return {
    types: [T_Boolean, T_Any],
    meta: {
      from: Op_IsEqual,
      latentTypes: [],
      latentMeta: null,
    },
    ...buildTemplater(template),
  };
}

// Optimization
const Optim_SmallestOf = ({ types, meta }, ...defs) => {
  const getSmallest = defs.reduce((acc, r) =>
    acc.peek().length > r.peek().length ? r : acc,
    { peek: () => ({ length: Infinity }) }
  );
  const template = ($) => () => getSmallest()[$]()
  return {
    types, meta,
    ...buildTemplater(template),
  };
}

/**
 * Defines intrinsics
 */

// Basic primitives
const In_Zero = () => Op_CastNumber(Op_Array());
const In_True = () => Op_IsEqual(In_Zero(), Op_Array());
const In_False = () => Op_IsEqual(Op_Array(), Op_Array());
const In_Undefined = () => Op_Index(Op_Array(), Op_Array());
const In_NaN = () => Op_CastNumber(In_Undefined());

// Intrinsic operators
const In_Group = (inner) => Op_Index(Op_Array(inner), In_Zero());
const In_Comma = (toVoid, toReturn) => Op_Assign(
  Op_Index(Op_Array(), toVoid), toReturn);

// Intrinsic casts
const In_CastString = (stringLike) => {
  const defs = [];

  // nothing if alr a string
  if (stringLike.types.includes(T_String))
    defs.push(stringLike);

  // []+<expr> if addressable or addressed
  if (stringLike.types.includes(T_Addressable) ||
    stringLike.types.includes(T_Addressed))
    defs.push(Op_Join(Op_Array(), stringLike));

  // <expr>+[] if come from number cast or inc
  // (assumes += doesn't exist)
  if (stringLike.types.includes(T_Number))
    defs.push(Op_Join(stringLike, Op_Array()));

  // []+[<expr>] otherwise
  defs.push(Op_Join(Op_Array(), Op_Array(stringLike)));

  return Optim_SmallestOf({
    types: [T_String, T_Any],
    meta: {
      from: Op_Join,
      latentTypes: [],
      latentMeta: null,
    }
  }, ...defs);
};


const Sym_Symbols = {};

const Sym_getKey = (value) => `<${({}).toString.call(value)
    .replace(/^\[object /, "")
    .replace(/\]$/, "")
  }/${typeof value === "string" ? `'${value}'` : value
  }>`;

const Sym_AddSymbol = (symbol) => {
  const key = Sym_getKey(symbol.eval());
  Sym_Symbols[key] ||= [];
  Sym_Symbols[key].push(symbol);
}

const Sym_GetSymbol = (value, {types, meta}) => {
  const key = Sym_getKey(value);

  if (!Sym_Symbols.hasOwnProperty(key))
    throw new ReferenceError(`${key} not found`);
  return Optim_SmallestOf({ types, meta }, ...Sym_Symbols[key]);
}

const Sym_AddWord = (symbol) => {
  Sym_AddSymbol(symbol);
}


