# JSFour
This is an attempt to write a compiler to rewrite JS into these four characters: `[+=]`


The project is currently a work in progress.

# [demo] [compiler-simple.html](https://gliu20.github.io/jsfour/compiler-simple.html)
# [demo] [compiler-v2.html](https://gliu20.github.io/jsfour/compiler-v2.html)

## A Simple Implementation and a Reckoning
Compiler simple and compiler-v2 are the inital implementations. It works, but after creating it, I realized that string templating is a bit faulty so I wanted to take a different approach to guarantee valid outputs. Secondly, I wanted to build a type system into the compiler to ensure that outputs are correct at the time I write the compiler expression instead of at runtime.

## Operations as Intermediate Representation
This required re-thinking what sort of 'atoms' I want to build upon. I decided, that operations was the best primitive (hence the `Op.*` namespace in the code), and the compiler would represent expressions as a tree and we can get a compiled expression by invoking compile on the root node which in turn would call compile on every node down.

## Type Safety
Then I considered how to build type safety into the system. For example, to have a grouping primitive that avoids the use of parentheses, I make use of `[{item that wants to be grouped}][0]`. However, it is not necessary to group an output if it already has been grouped by a similar construct. So to create a compiler that can emit the optimal output requires being able to inspect whether the input is already grouped.

This is where I came up with the concept of taints and types. Taint is an attribute that tarnishes a given expression. For example whether I have already grouped an item or not could be a taint. (In code, I use something more sophisticated which is addressable, addressed, and none). Next, types are your regular types like integers, numbers, and booleans. Through these types, I can properly determine at compile time what types needs to be casted and what does not need it so we can be efficient in the compiler output.  An example for what this optimization allows is shown here: [https://github.com/gliu20/jsfour/blob/dcd87d7b8a89f35aed637fd9ba4e062cf6361acc/compiler-refactor2.js#L248-L268](https://github.com/gliu20/jsfour/blob/dcd87d7b8a89f35aed637fd9ba4e062cf6361acc/compiler-refactor2.js#L248-L268)

To deal with cases that escape the type system, we can use `Masquerade` which tells the compiler to view an expression as a different type but don't cast or modify the output.


# [wip] [compiler-oop.html](https://gliu20.github.io/jsfour/compiler-oop.html)

## Refactors
I came up with the idea of labeling expressions as either being `addressable` or `addressed`. If an expression is `addressable` then you can index into the expression. If it is `addressed` then it has already been indexed into. However, this had its issues since I didn't immediately think of splitting the addressable and addressed types into taints and types so it became confusing to manage when these were intermingled with types like `number` and `boolean`. However, after writing it, I realized that it made sense to split the two and that was the reason for `compiler-refactor2.js`.

Additionally since our intermediate representation used operations as the building blocks, we can type-check on each operation and intelligently throw a TypeError or use some other primitive to massage the input to allow the operation to succeed. 
