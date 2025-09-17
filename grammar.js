const binary_chars = "-+\\\\/*~<>=@,%|&?!";
const symbol_chars = `[A-Za-z0-9_:]+|[${binary_chars}]+`;
const identifier_regex = /[A-Za-z_][A-Za-z0-9_]*/;

module.exports = grammar({
  name: "pharo",

  supertypes: ($) => [$.selector, $.expression, $.primary],
  conflicts: ($) => [
    [$.temporaries, $.primary],
    [$.temporaries, $.temporaries],
    [$.literal_array, $._literal_array_element],
    [$._literal_array_element, $.nested_array_literal],
  ],
  inline: ($) => [$.keyword_part],
  externals: ($) => [$.keyword],
  // word: ($) => $.identifier_or_keyword,
  extras: ($) => [$.comment, /[\s\f]/],

  rules: {
    source: ($) => choice($.source_file, $.package_file, $.method),
    source_file: ($) => seq(optional($.comment), $.class_definition, repeat($.method_definition)),

    class_definition: ($) => seq($.type, $.class_header),
    type: ($) => token(choice('Class', 'Trait', 'Extension')),

    ston_object: ($) => seq(
      "{",
      sep($.ston_pair, ","),
      optional(","),
      "}"
    ),
    ston_pair: ($) => seq($.ston_key, ":", $.ston_value),
    ston_key: ($) => $.symbol,
    ston_value: ($) =>
      choice(
        $.symbol,
        $.string,
        $.number,
        $.ston_array,
        $.ston_object
      ),
    ston_array: ($) => seq("[", sep($.ston_value, ","), optional(","), "]"),

    class_header: ($) =>
      prec.right(seq(
        "{",
        sep($.class_header_pair, ","),
        optional(","),
        "}"
      )),

    class_header_pair: ($) =>
      choice(
        prec(1, seq(field("key", alias("#name", $.ston_key)),          ":", field("name", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#superclass", $.ston_key)),    ":", field("superclass", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#traits", $.ston_key)),        ":", field("traits", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#classTraits", $.ston_key)),   ":", field("classTraits", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#category", $.ston_key)),      ":", field("category", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#package", $.ston_key)),       ":", field("package", choice($.string, $.symbol)))),
        prec(1, seq(field("key", alias("#instVars", $.ston_key)),      ":", field("instVars", $.ston_array))),
        prec(1, seq(field("key", alias("#classVars", $.ston_key)),     ":", field("classVars", $.ston_array))),
        prec(1, seq(field("key", alias("#pools", $.ston_key)),         ":", field("pools", $.ston_array))),
        prec(1, seq(field("key", alias("#classInstVars", $.ston_key)), ":", field("classInstVars", $.ston_array))),
        prec(1, seq(field("key", alias("#type", $.ston_key)),          ":", field("type", choice($.string, $.symbol)))),
        prec(0, $.ston_pair)
      ),

    method_definition: ($) => seq(optional($.method_metadata), $.method_header, "[", optional($.method_body), "]"),
    method_metadata: ($) => $.method_metadata_object,

    method_metadata_object: ($) =>
      seq("{", sep($.method_metadata_pair, ","), optional(","), "}"),

    method_metadata_pair: ($) =>
      choice(
        prec(1, seq(field("key", alias("#category", $.ston_key)), ":", field("category", choice($.string, $.symbol)))),
        prec(0, $.ston_pair)
      ),
    
    method_header: ($) => seq($.identifier, optional($.class_keyword), '>>', $.selector),
    class_keyword: ($) => 'class',
    
    method_body: ($) =>
      prec.right(
        choice(
          seq(
            repeat1(choice($.pragma, $.temporaries)),
            optional(seq(sep1($.statement, optional(".")), optional(".")))
          ),
          seq(
            repeat(choice($.pragma, $.temporaries)),
            sep1($.statement, optional(".")),
            optional(".")
          )
        )
      ),

    method: ($) => prec.right(seq($.selector, repeat(choice($.pragma, $.temporaries)), sep(optional($.statement), "."))),

    package_file: ($) => seq($.package_definition),

    package_definition: ($) => seq(token('Package'), $.package_data),
    package_data: ($) => prec.right(seq(
        "{",
        seq(field("key", alias("#name", $.ston_key)), ":", field("name", choice($.string, $.symbol))),
        "}"
      )),

    temporaries: ($) => prec.dynamic(10, seq("|", repeat($.identifier), "|")),

    selector: ($) =>
      choice($.unary_selector, $.binary_selector, $.keyword_selector),
    unary_selector: ($) => alias($.identifier, $.unary_identifier),
    binary_selector: ($) => seq($.binary_operator, $.identifier),
    keyword_selector: ($) => repeat1(seq($.keyword, $.identifier)),

    unary_message: ($) => prec(4, seq(field('receiver', $.expression), alias($.identifier, $.unary_identifier))),
    binary_message: ($) =>
      prec.left(3, seq(field('receiver', $.expression), $.binary_operator, $.expression)),
    keyword_message: ($) =>
      prec(-1, seq(field('receiver', $.expression), repeat1($.keyword_part))),
    keyword_part: ($) => seq($.keyword, $.expression),
    assignment: ($) => prec.left(-5, seq($.identifier, ":=", $.expression)),

    cascade: ($) => prec(-2, seq(field('receiver', $.expression), repeat1(seq(';', $._cascaded_send)))),
    _cascaded_send: ($) => choice(
      $.cascaded_unary_message,
      $.cascaded_binary_message,
      $.cascaded_keyword_message,
    ),
    cascaded_unary_message: ($) => prec(-2, alias($.identifier, $.unary_identifier)),
    cascaded_binary_message: ($) => prec(-3, seq($.binary_operator, $.expression)),
    cascaded_keyword_message: ($) => prec(-4, repeat1($.keyword_part)),

    // TODO: base should determine valid digits (need custom scanner)
    number: ($) => /(?:[-+]?[0-9]+\.[0-9]+|[-+]?(?:[0-9]+r)?[0-9]+)(?:[eE][-+]?[0-9]+)?/,
    string: ($) => token(seq("'", /([^']|'')*/, "'")),
    symbol: ($) => token(
      seq(
        "#",
        choice(
          new RegExp(symbol_chars),
          seq("'", /[^']*/, "'")
        )
      )
    ),
    character: ($) => /\$(\s|.)/,
    identifier: ($) => identifier_regex,
    binary_operator: ($) => new RegExp(`[${binary_chars}]+`),
    identifier_or_keyword: ($) => token(seq(identifier_regex, /:?/)),

    statement: ($) => choice($.expression, $.return),
    return: ($) => seq("^", $.expression),

    dynamic_array: ($) => seq("{", sep($.expression, "."), optional("."), "}"),
    byte_array: ($) => seq("#[", repeat($.number), "]"),
    literal_array: ($) => seq("#(", repeat($._literal_array_element), ")"),
    _literal_array_element: ($) => choice(
      $.string,
      $.number,
      $.character,
      $.nil,
      $.true,
      $.false,
      $.symbol,
      alias(new RegExp(symbol_chars), $.symbol),
      alias($.binary_operator, $.symbol),
      alias(/\./, $.symbol),
      alias('(', $.symbol),
      alias(')', $.symbol),
      alias('[', $.symbol),
      alias(']', $.symbol),
      alias('{', $.symbol),
      alias('}', $.symbol),
      alias(':', $.symbol),
      alias(':=', $.symbol),
      alias(';', $.symbol),
      alias('^', $.symbol),
      alias($.identifier, $.symbol),
      choice(alias($.nested_array_literal, $.literal_array), $.literal_array),
    ),
    nested_array_literal: ($) => seq('(', repeat($._literal_array_element), ')'),
    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    block_argument: ($) => /: *[A-Za-z_][A-Za-z0-9_]*/,
    block: ($) =>
      seq(
        "[",
        optional(seq(repeat($.block_argument), "|")),
        optional($.temporaries),
        optional("."),
        sep($.statement, "."),
        optional("."),
        "]"
      ),

    true: ($) => "true",
    false: ($) => "false",
    thisContext: ($) => "thisContext",
    self: ($) => "self",
    super: ($) => "super",
    nil: ($) => "nil",

    primary: ($) =>
      choice(
        $.identifier,
        $.dynamic_array,
        $.byte_array,
        $.literal_array,
        $.parenthesized_expression,
        $.number,
        $.string,
        $.character,
        $.symbol,
        $.block,
        $.true,
        $.false,
        $.thisContext,
        $.self,
        $.super,
        $.nil
      ),

    expression: ($) =>
      choice(
        $.unary_message,
        $.assignment,
        $.binary_message,
        $.keyword_message,
        $.cascade,
        $.primary
      ),

    pragma: ($) => seq('<', choice($.pragma_unary_selector, $.pragma_keyword_selector), '>'),
    pragma_unary_selector: ($) => alias($.identifier, $.unary_identifier),
    pragma_keyword_selector: ($) => repeat1(seq($.keyword, $.primary)),


    comment: ($) => token(seq("\"", /[^"]*/, "\"")),
  },
});

function sep1(rule, char) {
  return seq(rule, repeat(seq(char, rule)));
}

function sep(rule, char) {
  return optional(sep1(rule, char));
}
