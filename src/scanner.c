#include <tree_sitter/parser.h>
#include <wctype.h>

enum TokenType {
  KEYWORD,
  NUMBER,
};

static inline int digit_value(int32_t character) {
  if ('0' <= character && character <= '9') return (int)(character - '0');
  if ('A' <= character && character <= 'Z') return (int)(character - 'A' + 10);
  if ('a' <= character && character <= 'z') return (int)(character - 'a' + 10);
  return -1;
}

static bool scan_number(TSLexer *lexer) {
  if (lexer->lookahead == '+' || lexer->lookahead == '-') {
    lexer->advance(lexer, false);
  }

  if (!iswdigit(lexer->lookahead)) {
    return false;
  }

  unsigned base_candidate = 0;
  bool base_within_range = true;

  while (iswdigit(lexer->lookahead)) {
    unsigned digit = (unsigned)(lexer->lookahead - '0');
    base_candidate = base_candidate * 10 + digit;
    if (base_candidate > 36) {
      base_within_range = false;
    }
    lexer->advance(lexer, false);
  }

  lexer->mark_end(lexer);

  if ((lexer->lookahead == 'r' || lexer->lookahead == 'R') && base_within_range && base_candidate >= 2) {
    unsigned base = base_candidate;

    if (base < 2 || base > 36) {
      return false;
    }

    lexer->advance(lexer, false);

    bool has_digits_in_base = false;
    int value = digit_value(lexer->lookahead);
    while (value >= 0 && (unsigned)value < base) {
      has_digits_in_base = true;
      lexer->advance(lexer, false);
      value = digit_value(lexer->lookahead);
    }

    if (!has_digits_in_base) {
      return false;
    }

    lexer->mark_end(lexer);
    lexer->result_symbol = NUMBER;
    return true;
  }

  if (lexer->lookahead == '.') {
    lexer->advance(lexer, false);

    if (!iswdigit(lexer->lookahead)) {
      lexer->result_symbol = NUMBER;
      return true;
    }

    do {
      lexer->advance(lexer, false);
    } while (iswdigit(lexer->lookahead));

    lexer->mark_end(lexer);
  }

  if (lexer->lookahead == 'e' || lexer->lookahead == 'E') {
    lexer->advance(lexer, false);

    if (lexer->lookahead == '+' || lexer->lookahead == '-') {
      lexer->advance(lexer, false);
    }

    if (!iswdigit(lexer->lookahead)) {
      lexer->result_symbol = NUMBER;
      return true;
    }

    do {
      lexer->advance(lexer, false);
    } while (iswdigit(lexer->lookahead));

    lexer->mark_end(lexer);
  }

  lexer->result_symbol = NUMBER;
  return true;
}

void *tree_sitter_pharo_external_scanner_create() { return NULL; }
void tree_sitter_pharo_external_scanner_destroy(void *p) {}
unsigned tree_sitter_pharo_external_scanner_serialize(void *p, char *buffer) { return 0; }
void tree_sitter_pharo_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

bool tree_sitter_pharo_external_scanner_scan(void *p, TSLexer *lexer, const bool *valid_symbols) {
  if (!valid_symbols[KEYWORD] && !valid_symbols[NUMBER]) {
    return false;
  }

  while (iswspace(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  if (valid_symbols[NUMBER]) {
    bool scanned_number = scan_number(lexer);
    if (scanned_number) {
      return true;
    }
    if (!valid_symbols[KEYWORD]) {
      return false;
    }
  }

  if (valid_symbols[KEYWORD]) {
    if (iswalpha(lexer->lookahead) || lexer->lookahead == '_') { // Pharo can have _ as identifier prefix
      do {
        lexer->advance(lexer, false);
      } while (iswalnum(lexer->lookahead) || lexer->lookahead == '_');

      if (lexer->lookahead == ':') {
        lexer->advance(lexer, false);
        if (lexer->lookahead != '=') {
          lexer->result_symbol = KEYWORD;
          return true;
        }
      }
    }
  }

  return false;
}
