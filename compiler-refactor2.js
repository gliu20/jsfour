/**
 * Taints to define: 
 * 
 * - addressable:array
 * - addressable:string
 * 
 * - addressed:array
 * - addressed:string
 * - addressed:number
 * - addressed:boolean
 * 
 * - none:string
 * - none:number
 * - none:boolean
 * 
 */

/**
 * Basic Operations
 * - OpArray        - [<any:any>?]                          returns addressable:array
 * - OpIndex        - <addressable:any>[<any:any>]          returns addressed:<type>
 * - OpCastNumber   - +<addressable:any|addressed:any>      returns none:number
 * - OpIncrement    - ++<addressed:any>                     returns none:increment
 * - OpJoin         -                                       returns none:string|none:number
 *      <addressable:any|addressed:any|none:number|none:string>+  
 *      <addressable:any|addressed:any|none:string>
 * - OpAssign       - <addressed:any>=<any:any>             returns any
 * - OpCompare      - <any:any>==<any:any>                  returns none:boolean
 * 
 * Unsupported Ops
 * - IncrementAssign +=         not implemented since requires complex type tracking
 * - StrictCompare ===          not implemented
 */

// Each op needs to define which ops can remove taints and how it can be removed
const makeTaintType = (taint) => (type) => {
    const a = {
        taint, type,
        toString: () => `${taint}:${type}`,
    }
    const isTypeMatchStrict = (bType) => bType === type;
    const isTypeMatch = (bType) => bType === type ||
        type === "any" ||
        bType === "any";
    const isTaintMatch = (bTaint) => bTaint === taint ||
        taint === "any" ||
        bTaint === "any";
    const isMatch = (b) => isTypeMatch(b.type) && isTaintMatch(b.taint);
    const assert = (b) => {
        if (!isMatch(b))
            throw new TypeError(`Expected ${b} but got ${a}`);
    }
    const assertAny = (...list) => {
        for (let b of list) {
            if (isMatch(b)) return;
        }
        throw new TypeError(`Expected ${list.join("|")} but got ${a}`);
    }
    return {
        isTypeMatch, isTaintMatch, isMatch,
        isTypeMatchStrict,
        assert, assertAny,
        ...a,
    };
};

const TaintType = {
    addressable: makeTaintType("addressable"),
    addressed: makeTaintType("addressed"),
    none: makeTaintType("none"),
    any: makeTaintType("any"),
};

const makeTemplateMethods = (template) => ({
    compile: template("compile"),
    peek: template("peek"),
    eval: () => eval(template("peek")()),
});

const Op = {
    Array: (inner = {
        type: [TaintType.any("any")],
        compile: () => ``,
        peek: () => '',
    }) => {
        const template = ($) => () => `[${inner[$]()}]`;

        inner.type[0].assert(TaintType.any("any"));

        return {
            type: [TaintType.addressable("array"), ...inner.type.slice(0)],
            ...makeTemplateMethods(template)
        };
    },
    Index: (addressable, index) => {
        const template = ($) => () => `${addressable[$]()}[${index[$]()}]`;

        addressable.type[0].assertAny(
            TaintType.addressable("any"),
            TaintType.addressed("any")
        );
        index.type[0].assert(TaintType.any("any"));

        const type = addressable.type[0].isTypeMatchStrict("string") ?
            TaintType.addressed("string") :
            TaintType.addressed(addressable.type[1].type);

        return {
            type: [
                type,
                ...addressable.type.slice(2)
            ],
            ...makeTemplateMethods(template)
        };
    },
    CastNumber: (numberLike) => {
        const template = ($) => () => `+${numberLike[$]()}`;

        if (numberLike.type[0].isTypeMatchStrict("number"))
            return numberLike;

        numberLike.type[0].assertAny(
            TaintType.addressable("any"),
            TaintType.addressed("any")
        );

        return {
            type: [TaintType.none("number")],
            ...makeTemplateMethods(template)
        };
    },

    Increment: (numberLike) => {
        const template = ($) => () => `++${numberLike[$]()}`;

        numberLike.type[0].assert(TaintType.addressed("any"));

        return {
            type: [TaintType.none("number")],
            ...makeTemplateMethods(template)
        };
    },

    Join: (a, b) => {
        const template = ($) => () => `${a[$]()}+${b[$]()}`;

        a.type[0].assertAny(
            TaintType.addressed("any"),
            TaintType.addressable("any"),
            TaintType.none("string"),
            TaintType.none("number")
        );
        b.type[0].assertAny(
            TaintType.addressed("any"),
            TaintType.addressable("any"),
            TaintType.none("string")
        );

        const isNumberLikeA =
            a.type[0].isTypeMatch("number") ||
            a.type[0].isTypeMatch("boolean");
        const isNumberLikeB =
            b.type[0].isTypeMatch("number") ||
            b.type[0].isTypeMatch("boolean");
        const returnsNumber = isNumberLikeA && isNumberLikeB;

        return {
            type: [TaintType.none(returnsNumber ? "number" : "string")],
            ...makeTemplateMethods(template)
        };
    },

    Assign: (addressed, assignee) => {
        const template = ($) => () => `${addressed[$]()}=${assignee[$]()}`;

        addressed.type[0].assertAny(
            TaintType.addressed("any"),
            TaintType.addressable("any")
        );

        addressed.type[0].assert(TaintType.any("any"));

        return {
            type: [
                TaintType.none(addressed.type[0].type),
                ...addressed.type.slice(1)
            ],
            ...makeTemplateMethods(template)
        };
    },

    Compare: (a, b) => {
        const template = ($) => () => `${a[$]()}==${b[$]()}`;

        a.type[0].assertAny(
            TaintType.addressed("any"),
            TaintType.addressable("any")
        );
        b.type[0].assertAny(
            TaintType.addressed("any"),
            TaintType.addressable("any")
        );

        return {
            type: [TaintType.none("boolean")],
            ...makeTemplateMethods(template)
        };
    },

    Masquerade: (value, type) => {
        const template = ($) => () => value[$]();

        return {
            type: type.slice(0),
            ...makeTemplateMethods(template)
        };
    },

    SmallestOf: (...defs) => {
        const getSmallest = () => defs.reduce((acc, r) =>
            acc.peek().length > r.peek().length ? r : acc,
            { peek: () => ({ length: Infinity }) }
        );

        const template = ($) => () => getSmallest()[$]();
        return {
            type: defs[0].type.slice(0),
            ...makeTemplateMethods(template),
        };
    }
};

const BuiltIn = {
    // Primitives
    zero: () => Op.CastNumber(Op.Array()),
    false: () => Op.Compare(Op.Array(), Op.Array()),
    true: () => Op.Compare(Op.Masquerade(
        BuiltIn.zero(),
        [TaintType.any("any")]
    ), Op.Array()),
    undefined: () => Op.Index(Op.Array(), Op.Array()),
    NaN: () => Op.CastNumber(BuiltIn.undefined()),

    // Methods
    Group: (inner) => Op.Index(Op.Array(inner), BuiltIn.zero()),
    Comma: (toVoid, toReturn) => Op.Assign(
        Op.Index(Op.Array(), toVoid), toReturn),
    CastString: (stringLike) => {
        const defs = [];

        if (stringLike.type[0].isTypeMatchStrict("string"))
            return stringLike;

        // We implement this logic for picking the 
        // type of expression for string type conversion
        // []+<expr>        for addressable or addressed
        // <expr>+[]        for numbers
        // []+[<expr>]      otherwise

        if (stringLike.type[0].isMatch(TaintType.addressable("any")) ||
            stringLike.type[0].isMatch(TaintType.addressed("any")))
            return Op.Join(Op.Array(), stringLike);

        if (stringLike.type[0].isTypeMatchStrict("number"))
            return Op.Join(stringLike, Op.Array());

        return Op.Join(Op.Array(), Op.Array(stringLike));
    },


    // Digits
    digit: (d) => {
        d = parseInt(d);

        if (d < 0 || d > 9 || Number.isNaN(d))
            return TypeError(`Expected digit but got '${d}'`);

        if (d === 0) return BuiltIn.zero();
        if (d === 1) return Op.Increment(BuiltIn.Group(Op.Array()));
        if (d === 2) return Op.Increment(BuiltIn.Group(BuiltIn.true()));

        let def = Op.Increment(BuiltIn.Group(BuiltIn.true()));
        const plusOne = (inner) => Op.Increment(BuiltIn.Group(inner));

        for (let i = 2; i < d; i++) {
            def = plusOne(def);
        }

        return def;
    },

    weakNumber: (num) => {
        if (typeof num !== "number" || Number.isNaN(num))
            return TypeError(`Expected number but got '${num}'`);

        if (num <= 9) return BuiltIn.digit(num);

        num = num + "";
        num = num.split("").map(BuiltIn.digit);

        let def = num.pop();

        while (num.length > 0) {
            def = Op.Join(num.pop(), Op.Array(def));
        }

        return def;
    },

    weakArray: (inner) => {
        if (inner.type[0].isMatch(TaintType.addressable("any")) ||
            inner.type[0].isMatch(TaintType.addressed("any")))
            return inner;
        return Op.Array(inner);
    },

    // More primitives
    Infinity: () => Op.CastNumber(Op.Array(getSymbol("1e1000"))),
    "1.1e+101": () => Op.CastNumber(Op.Array(getSymbol("11e100"))),
    "1.1e+21": () => Op.CastNumber(Op.Array(getSymbol("11e20"))),
    "1e-7": () => Op.CastNumber(Op.Array(getSymbol(".0000001"))),


    // Now we implement a store & a retrieve
    db: () => Op.Index(Op.Array(), getSymbol("at")), 
};

const Symbols = {};

const makeKey = (value) => `<${({}).toString.call(value)
    .replace(/^\[object /, "")
    .replace(/\]$/, "")
    }/${typeof value === "string" ? `'${value}'` : value}>`;


const addSymbol = (symbol) => {
    const key = makeKey(symbol.eval());
    Symbols[key] ||= [];
    Symbols[key].push(symbol);
}

const getSymbol = (value) => {
    const key = makeKey(value);

    if (!Symbols.hasOwnProperty(key))
        throw new ReferenceError(`${key} not found`);
    return Op.SmallestOf(...Symbols[key]);
}

const addWord = (symbol, until) => {
    const word = BuiltIn.CastString(symbol);
    const wordLength = until ?
        word.eval().indexOf(until) + 1 :
        word.eval().length;

    for (let i = 0; i < wordLength; i++) {
        const letter = Op.Index(BuiltIn.Group(word), BuiltIn.weakNumber(i));
        addSymbol(letter);
    }
}

const makeWord = (word) => {
    word = word.split("");

    const getLetter = () => {
        const letter = word.shift();
        const isDigit = !Number.isNaN(parseInt(letter));

        if (isDigit)
            return getSymbol(parseInt(letter));
        return getSymbol(letter);
    }
    let def = getLetter();

    while (word.length > 0) {
        def = Op.Join(def, BuiltIn.weakArray(getLetter()));
    }
    return def;
}



addSymbol(BuiltIn.digit(0))
addSymbol(BuiltIn.digit(1))
addSymbol(BuiltIn.digit(2))
addSymbol(BuiltIn.digit(3))
addSymbol(BuiltIn.digit(4))
addSymbol(BuiltIn.digit(5))
addSymbol(BuiltIn.digit(6))
addSymbol(BuiltIn.digit(7))
addSymbol(BuiltIn.digit(8))
addSymbol(BuiltIn.digit(9))

addWord(BuiltIn.false())
addWord(BuiltIn.true())
addWord(BuiltIn.undefined())
addWord(BuiltIn.NaN())


addSymbol(makeWord("1e1000"));
addSymbol(makeWord("11e20"));
addSymbol(makeWord("11e100"));

addWord(BuiltIn.Infinity());
addWord(BuiltIn["1.1e+101"]());
addWord(BuiltIn["1.1e+21"]());

addSymbol(makeWord(".0000001"));
addWord(BuiltIn["1e-7"]());

addSymbol(makeWord("at"));
addSymbol(makeWord("flat"));

addWord(Op.Index(Op.Array(), getSymbol("at")), "{");

// Now we want to make the ternary operator
// Now we want to make the caching operator
// We also want a strings list so we can use caching on common strings



addSymbol(makeWord("constructor"));

console.table(
    Object.fromEntries(
        Object.entries(Symbols)
            .map(([key, value]) =>
                [key, Op.SmallestOf(...value).peek()])
    )
)
