/**
 * @file Tree-sitter grammar for ArkType type definition language
 * @license MIT
 */

// import Typescript from "tree-sitter-typescript/typescript/grammar.js";

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// const { rules: ts_rules } = Typescript.grammar;

export default grammar({
  name: "arktype",

  word: ($) => $.identifier,

  inline: ($) => [$.ark_string, $.ark_single_string, $.ark_double_string],

  rules: {
    // Entry point: a single type definition
    source_file: ($) => optional($.type_definition),

    // type|generic|scope|define|match|fn|module|[aA]rk[a-zA-Z]*
    ark_definition: ($) =>
      seq(
        alias(
          choice("type", "generic", "scope", "define", "match", "fn", "module", /[aA]rk[a-zA-Z]*/),
          $.ark_keyword,
        ),
        "(",
        choice(commaSep1($.type_definition), optional(",")),
        ")",
      ),

    // Top-level type definition
    type_definition: ($) =>
      choice(
        choice(seq("'", $._type_expression, "'"), seq('"', $._type_expression, '"')),
        $.tuple_type,
        $.object_type,
        $.ark_definition,
      ),

    // Internal type expression (can be nested)
    _type_expression: ($) =>
      choice(
        alias($._number, $.unary_expression),
        $.ark_expression,
        $.union_type,
        $.array_type,
        $.parenthesized_type,
        $.tuple_type,
        $.literal_type,
        $.primitive_type,
      ),

    object_type: ($) => seq("{", commaSep1($.ark_property_signature), optional(","), "}"),

    ark_property_signature: ($) =>
      seq(field("name", $._property_name), ":", field("type", $.type_definition)),

    ark_expression: ($) =>
      prec.left(
        1,
        seq(field("left", $._type_expression), $.ark_operator, field("right", $._type_expression)),
      ),

    // Union type: "string | number" (left-associative, lowest precedence)
    union_type: ($) =>
      prec.left(1, seq(field("left", $._type_expression), "|", field("right", $._type_expression))),

    // Array type: "string[]" (higher precedence than union)
    array_type: ($) => prec(2, seq(field("element", $._type_expression), "[]")),

    // Tuple type: "[string, number, ...]"
    tuple_type: ($) => seq("[", commaSep($.type_definition), optional($.type_definition), "]"),

    // Parenthesized type: "(string | number)"
    parenthesized_type: ($) => seq("(", $.type_definition, ")"),

    literal_type: ($) => choice($.ark_string, $.number, $.true, $.false, $.null, $.undefined),

    // Primitive types
    primitive_type: (_) =>
      choice("string", "number", "boolean", "bigint", "symbol", "unknown", "any", "never", "void"),

    ark_operator: () => choice("<", ">", "=", "%", "&", "|"),

    //
    // Primitives
    //

    // TODO: incorrectly allows { key?: ... } and does not distinguish { "key?": ... } from ark_string
    _property_name: ($) => choice($._required_property_name, $._optional_property_name),

    _required_property_name: ($) =>
      prec(
        1,
        choice(
          alias($.identifier, $.property_identifier),
          // $.private_property_identifier,
          $.ark_string,
          $.number,
          $.computed_property_name,
        ),
      ),
    _optional_property_name: ($) => prec(2, seq($._required_property_name, $.optional)),

    computed_property_name: ($) =>
      seq(
        "[",
        choice($.identifier, $.ark_string), // TODO: support or get rid of
        "]",
      ),

    identifier: (_) => {
      const alpha =
        /[^\x00-\x1F\s\p{Zs}0-9:;`"'@#.,|^&<=>+\-*/\\%?!~()\[\]{}\uFEFF\u2060\u200B\u2028\u2029]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;

      const alphanumeric =
        /[^\x00-\x1F\s\p{Zs}:;`"'@#.,|^&<=>+\-*/\\%?!~()\[\]{}\uFEFF\u2060\u200B\u2028\u2029]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      return token(seq(alpha, repeat(alphanumeric)));
    },

    ark_string: ($) => choice($.ark_double_string, $.ark_single_string),
    ark_double_string: ($) =>
      seq('"', repeat(alias($.unescaped_double_string_fragment, $.string_fragment)), '"'),

    ark_single_string: ($) =>
      seq("'", repeat(alias($.unescaped_single_string_fragment, $.string_fragment)), "'"),

    unescaped_double_string_fragment: (_) => token.immediate(prec(1, /[^"\\\r\n]+/)),
    unescaped_single_string_fragment: (_) => token.immediate(prec(1, /[^'\\\r\n]+/)),

    _number: ($) =>
      prec.left(1, seq(field("operator", choice("-", "+")), field("argument", $.number))),

    number: (_) => {
      // TODO: strip out stuff that arktype doesn't support
      const hexLiteral = seq(choice("0x", "0X"), /[\da-fA-F](_?[\da-fA-F])*/);

      const decimalDigits = /\d(_?\d)*/;
      const signedInteger = seq(optional(choice("-", "+")), decimalDigits);
      const exponentPart = seq(choice("e", "E"), signedInteger);

      const binaryLiteral = seq(choice("0b", "0B"), /[0-1](_?[0-1])*/);

      const octalLiteral = seq(choice("0o", "0O"), /[0-7](_?[0-7])*/);

      const bigintLiteral = seq(
        choice(hexLiteral, binaryLiteral, octalLiteral, decimalDigits),
        "n",
      );

      const decimalIntegerLiteral = choice(
        "0",
        seq(optional("0"), /[1-9]/, optional(seq(optional("_"), decimalDigits))),
      );

      const decimalLiteral = choice(
        seq(decimalIntegerLiteral, ".", optional(decimalDigits), optional(exponentPart)),
        seq(".", decimalDigits, optional(exponentPart)),
        seq(decimalIntegerLiteral, exponentPart),
        decimalDigits,
      );

      return token(choice(hexLiteral, decimalLiteral, binaryLiteral, octalLiteral, bigintLiteral));
    },

    true: (_) => "true",
    false: (_) => "false",
    null: (_) => "null",
    undefined: (_) => "undefined",
    optional: ($) => "?",
  },
});

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {SeqRule}
 *
 */
function commaSep1(rule) {
  return sepBy1(",", rule);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {SeqRule}
 *
 */
function commaSep(rule) {
  return sepBy(",", rule);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a separator
 *
 * @param {RuleOrLiteral} sep
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {ChoiceRule}
 */
function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a separator
 *
 * @param {RuleOrLiteral} sep
 *
 * @param {RuleOrLiteral} rule
 *
 * @return {SeqRule}
 */
function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}
