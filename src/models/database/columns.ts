import ColumnType from '~/models/database/ColumnType';
import { DatabaseType } from './DatabaseType';

const POSTGRES_SMALL_INT = new ColumnType({ id: 11, name: 'smallint', description: '2バイト符号付き整数', baseQuery: 'SMALLINT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true });
const POSTGRES_INTEGER = new ColumnType({ id: 15, name: 'integer', description: '4バイト符号付き整数', baseQuery: 'INTEGER', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true });
const POSTGRES_BIGINT = new ColumnType({ id: 17, name: 'bigint', description: '8バイト符号付き整数', baseQuery: 'BIGINT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true });

const databaseColumns: { [key in DatabaseType]: ColumnType[] } = {
    // cSpell: ignore bytea smallserial bigserial tsquery tsvector lseg macaddr
    "postgres": [
        new ColumnType({ id: 1, name: 'bit', description: '固定長ビット列', baseQuery: 'BIT', category: 'bit', withPrecision: false, withScale: false }),
        new ColumnType({ id: 2, name: 'bit (n)', description: '固定長ビット列', baseQuery: 'BIT[[PARAM]]', category: 'bit', withPrecision: true, withScale: false }),
        new ColumnType({ id: 4, name: 'bit varying', description: '可変長ビット列', baseQuery: 'BIT VARYING', category: 'bit', withPrecision: false, withScale: false }),
        new ColumnType({ id: 5, name: 'bit varying (n)', description: '可変長ビット列', baseQuery: 'BIT VARYING[[PARAM]]', category: 'bit', withPrecision: true, withScale: false }),
        new ColumnType({ id: 6, name: 'boolean', description: '論理値 (真/偽)', baseQuery: 'BOOLEAN', category: 'bit', withPrecision: false, withScale: false }),
        new ColumnType({ id: 367, name: 'bytea', description: 'バイナリデータ (「バイトの配列 (byte array)」)', baseQuery: 'BYTEA', category: 'bit', withPrecision: false, withScale: false }),

        POSTGRES_SMALL_INT,

        new ColumnType({ id: 51, name: 'smallserial', description: '自動増分2バイト整数', baseQuery: 'SMALLSERIAL', category: 'integer', withPrecision: false, withScale: false, foreignColumn: POSTGRES_SMALL_INT }),

        POSTGRES_INTEGER,

        new ColumnType({ id: 55, name: 'serial', description: '自動増分4バイト整数', baseQuery: 'SERIAL', category: 'integer', withPrecision: false, withScale: false, foreignColumn: POSTGRES_INTEGER }),

        POSTGRES_BIGINT,

        new ColumnType({ id: 57, name: 'bigserial', description: '自動増分8バイト整数', baseQuery: 'BIGSERIAL', category: 'integer', withPrecision: false, withScale: false, foreignColumn: POSTGRES_BIGINT }),

        new ColumnType({ id: 31, name: 'real', description: '単精度浮動小数点 (4バイト)', baseQuery: 'REAL', category: 'decimal', withPrecision: false, withScale: false }),
        new ColumnType({ id: 33, name: 'double precision', description: '倍精度浮動小数点 (8バイト)', baseQuery: 'DOUBLE PRECISION', category: 'decimal', withPrecision: false, withScale: false }),
        new ColumnType({ id: 35, name: 'decimal', description: '精度の選択可能な高精度数値', baseQuery: 'DECIMAL', category: 'decimal', withPrecision: false, withScale: false }),
        new ColumnType({ id: 36, name: 'numeric', description: '精度の選択可能な高精度数値', baseQuery: 'NUMERIC', category: 'decimal', withPrecision: false, withScale: false }),
        new ColumnType({ id: 45, name: 'decimal (p, s)', description: '精度の選択可能な高精度数値', baseQuery: 'DECIMAL[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true }),
        new ColumnType({ id: 46, name: 'numeric (p, s)', description: '精度の選択可能な高精度数値', baseQuery: 'NUMERIC[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true }),

        new ColumnType({ id: 101, name: 'date', description: '暦の日付 (年月日)', baseQuery: 'DATE', category: 'timestamp', withPrecision: false, withScale: false }),
        new ColumnType({ id: 131, name: 'time without time zone', description: '時刻 (時間帯なし)', baseQuery: 'TIME WITHOUT TIME ZONE', category: 'timestamp', withPrecision: false, withScale: false }),
        new ColumnType({ id: 132, name: 'time with time zone', description: '時間帯付き時刻', baseQuery: 'TIME WITH TIME ZONE', category: 'timestamp', withPrecision: false, withScale: false }),
        new ColumnType({ id: 141, name: 'time (p) without time zone', description: '時刻 (時間帯なし)', baseQuery: 'TIME[[PARAM]] WITHOUT TIME ZONE', category: 'timestamp', withPrecision: true, withScale: false }),
        new ColumnType({ id: 142, name: 'time (p) with time zone', description: '時間帯付き時刻', baseQuery: 'TIME[[PARAM]] WITH TIME ZONE', category: 'timestamp', withPrecision: true, withScale: false }),
        new ColumnType({ id: 111, name: 'timestamp without time zone', description: '日付と時刻 (時間帯なし)', baseQuery: 'TIMESTAMP WITHOUT TIME ZONE', category: 'timestamp', withPrecision: false, withScale: false }),
        new ColumnType({ id: 112, name: 'timestamp with time zone', description: '時間帯付き日付と時刻', baseQuery: 'TIMESTAMP WITH TIME ZONE', category: 'timestamp', withPrecision: false, withScale: false }),
        new ColumnType({ id: 121, name: 'timestamp (p) without time zone', description: '日付と時刻 (時間帯なし)', baseQuery: 'TIMESTAMP[[PARAM]] WITHOUT TIME ZONE', category: 'timestamp', withPrecision: true, withScale: false }),
        new ColumnType({ id: 122, name: 'timestamp (p) with time zone', description: '時間帯付き日付と時刻', baseQuery: 'TIMESTAMP[[PARAM]] WITH TIME ZONE', category: 'timestamp', withPrecision: true, withScale: false }),

        new ColumnType({ id: 301, name: 'char', description: '固定長文字列', baseQuery: 'CHAR', category: 'text', withPrecision: false, withScale: false }),
        new ColumnType({ id: 302, name: 'varchar', description: '可変長文字列', baseQuery: 'VARCHAR', category: 'text', withPrecision: false, withScale: false }),
        new ColumnType({ id: 311, name: 'char (n)', description: '固定長文字列', baseQuery: 'CHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false }),
        new ColumnType({ id: 312, name: 'varchar (n)', description: '可変長文字列', baseQuery: 'VARCHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false }),
        new ColumnType({ id: 325, name: 'text', description: '可変長文字列', baseQuery: 'TEXT', category: 'text', withPrecision: false, withScale: false }),

        new ColumnType({ id: 411, name: 'uuid', description: '汎用一意識別子', baseQuery: 'UUID', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 421, name: 'json', description: 'テキストのJSONデータ', baseQuery: 'JSON', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 422, name: 'jsonb', description: 'バイナリ JSON データ, 展開型', baseQuery: 'JSONB', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 431, name: 'xml', description: 'XMLデータ', baseQuery: 'XML', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 441, name: 'money', description: '貨幣金額', baseQuery: 'MONEY', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 451, name: 'tsquery', description: 'テキスト検索問い合わせ', baseQuery: 'TSQUERY', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 453, name: 'tsvector', description: 'テキスト検索文書', baseQuery: 'TSVECTOR', category: 'other', withPrecision: false, withScale: false }),

        new ColumnType({ id: 1011, name: 'point', description: '平面上の幾何学的点', baseQuery: 'POINT', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1021, name: 'line', description: '平面上の無限直線', baseQuery: 'LINE', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1022, name: 'lseg', description: '平面上の線分', baseQuery: 'LSEG', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1031, name: 'box', description: '平面上の矩形', baseQuery: 'BOX', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1032, name: 'circle', description: '平面上の円', baseQuery: 'CIRCLE', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1041, name: 'path', description: '平面上の幾何学的経路', baseQuery: 'PATH', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1042, name: 'polygon', description: '平面上の閉じた幾何学的経路', baseQuery: 'POLYGON', category: 'other', withPrecision: false, withScale: false }),

        new ColumnType({ id: 1111, name: 'cidr', description: 'IPv4もしくはIPv6ネットワークアドレス', baseQuery: 'CIDR', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1112, name: 'inet', description: 'IPv4もしくはIPv6ホストアドレス', baseQuery: 'INET', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1121, name: 'macaddr', description: 'MAC (Media Access Control)アドレス', baseQuery: 'MACADDR', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 1122, name: 'macaddr8', description: 'MAC (Media Access Control) アドレス (EUI-64 形式)', baseQuery: 'MACADDR8', category: 'other', withPrecision: false, withScale: false }),

        new ColumnType({ id: 9101, name: 'pg_lsn', description: 'PostgreSQLログシーケンス番号', baseQuery: 'PG_LSN', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 9102, name: 'pg_snapshot', description: 'ユーザレベルのトランザクションIDスナップショット', baseQuery: 'PG_SNAPSHOT', category: 'other', withPrecision: false, withScale: false }),
        new ColumnType({ id: 9103, name: 'oid', description: 'オブジェクト識別子データ', baseQuery: 'OID', category: 'other', withPrecision: false, withScale: false }),

        ColumnType.EMPTY
    ],

    // cSpell: ignore tinyint mediumint tinytext mediumtext longtext varbinary tinyblob mediumblob longblob linestring multipoint multilinestring multipolygon geometrycollection
    "mysql": [
        new ColumnType({ id: 1, name: 'bit', description: 'ビット値型', baseQuery: 'BIT', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2, name: 'bit (m)', description: 'ビット値型', baseQuery: 'BIT[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 6, name: 'boolean', description: 'TINYINT(1) のシノニム', baseQuery: 'BOOLEAN', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        new ColumnType({ id: 10, name: 'tinyint', description: '非常に小さい整数。 符号付きの範囲は -128 から 127 です。 符号なしの範囲は 0 から 255 です。', baseQuery: 'TINYINT', category: 'integer', withPrecision: false, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 11, name: 'smallint', description: '小さい整数。 符号付きの範囲は -32768 から 32767 です。 符号なしの範囲は 0 から 65535 です。', baseQuery: 'SMALLINT', category: 'integer', withPrecision: false, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 13, name: 'mediumint', description: '中間サイズの整数。 符号付きの範囲は -8388608 から 8388607 です。 符号なしの範囲は 0 から 16777215 です。', baseQuery: 'MEDIUMINT', category: 'integer', withPrecision: false, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 15, name: 'int', description: '普通サイズの整数。 符号付きの範囲は -2147483648 から 2147483647 です。 符号なしの範囲は 0 から 4294967295 です。', baseQuery: 'INT', category: 'integer', withPrecision: false, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 17, name: 'bigint', description: '大きい整数。 符号付きの範囲は -9223372036854775808 から 9223372036854775807 です。 符号なしの範囲は 0 から 18446744073709551615 です。', baseQuery: 'BIGINT', category: 'integer', withPrecision: false, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 20, name: 'tinyint (m)', description: '非常に小さい整数。 符号付きの範囲は -128 から 127 です。 符号なしの範囲は 0 から 255 です。', baseQuery: 'TINYINT[[PARAM]]', category: 'integer', withPrecision: true, withScale: false, withUnsigned: true, withAutoIncrement: false }),
        new ColumnType({ id: 21, name: 'smallint (m)', description: '小さい整数。 符号付きの範囲は -32768 から 32767 です。 符号なしの範囲は 0 から 65535 です。', baseQuery: 'SMALLINT[[PARAM]]', category: 'integer', withPrecision: true, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 23, name: 'mediumint (m)', description: '中間サイズの整数。 符号付きの範囲は -8388608 から 8388607 です。 符号なしの範囲は 0 から 16777215 です。', baseQuery: 'MEDIUMINT[[PARAM]]', category: 'integer', withPrecision: true, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 25, name: 'int (m)', description: '普通サイズの整数。 符号付きの範囲は -2147483648 から 2147483647 です。 符号なしの範囲は 0 から 4294967295 です。', baseQuery: 'INT[[PARAM]]', category: 'integer', withPrecision: true, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 27, name: 'bigint (m)', description: '大きい整数。 符号付きの範囲は -9223372036854775808 から 9223372036854775807 です。 符号なしの範囲は 0 から 18446744073709551615 です。', baseQuery: 'BIGINT[[PARAM]]', category: 'integer', withPrecision: true, withScale: false, withUnsigned: true, withAutoIncrement: true }),
        new ColumnType({ id: 31, name: 'float', description: '小さい (単精度) 浮動小数点数。 許可される値は、-3.402823466E+38 から -1.175494351E-38、0、および 1.175494351E-38 から 3.402823466E+38 です。', baseQuery: 'FLOAT', category: 'decimal', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: true }),
        new ColumnType({ id: 33, name: 'double', description: '普通サイズ (倍精度) の浮動小数点数。 許可されている値は、-1.7976931348623157E+308 から -2.2250738585072014E-308、0、および 2.2250738585072014E-308 から 1.7976931348623157E+308 です。', baseQuery: 'DOUBLE', category: 'decimal', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: true }),
        new ColumnType({ id: 35, name: 'decimal', description: '固定小数点数。 桁数10 (精度) で、小数点以下の桁数0です。', baseQuery: 'DECIMAL', category: 'decimal', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: true }),
        new ColumnType({ id: 36, name: 'numeric', description: 'DECIMAL のシノニムです。固定小数点数。 桁数10 (精度) で、小数点以下の桁数0です。', baseQuery: 'NUMERIC', category: 'decimal', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: true }),
        new ColumnType({ id: 41, name: 'float (m, d)', description: '小さい (単精度) 浮動小数点数。 許可される値は、-3.402823466E+38 から -1.175494351E-38、0、および 1.175494351E-38 から 3.402823466E+38 です。', baseQuery: 'FLOAT[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 42, name: 'float (p)', description: '浮動小数点数です。p は精度をビットで表現します。', baseQuery: 'FLOAT[[PARAM]]', category: 'decimal', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 43, name: 'double (m, d)', description: '普通サイズ (倍精度) の浮動小数点数。 許可されている値は、-1.7976931348623157E+308 から -2.2250738585072014E-308、0、および 2.2250738585072014E-308 から 1.7976931348623157E+308 です。', baseQuery: 'DOUBLE[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 45, name: 'decimal (m, d)', description: '固定小数点数。 M は桁数の合計 (精度) で、D は小数点以下の桁数 (スケール) です。', baseQuery: 'DECIMAL[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 46, name: 'numeric (m, d)', description: 'DECIMAL のシノニムです。固定小数点数。 M は桁数の合計 (精度) で、D は小数点以下の桁数 (スケール) です。', baseQuery: 'NUMERIC[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 101, name: 'date', description: '日付です。 サポートしている範囲は "1000-01-01" から "9999-12-31" です。', baseQuery: 'DATE', category: 'timestamp', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['(CURRENT_DATE)'] }),
        new ColumnType({ id: 131, name: 'time', description: '時間です。 範囲は、"-838:59:59.000000" から "838:59:59.000000" です。', baseQuery: 'TIME', category: 'timestamp', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['(CURRENT_TIME)'] }),
        new ColumnType({ id: 141, name: 'time (p)', description: '時間です。 範囲は、"-838:59:59.000000" から "838:59:59.000000" です。', baseQuery: 'TIME[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['(CURRENT_TIME)'] }),
        new ColumnType({ id: 112, name: 'datetime', description: '日付と時間の組み合わせです。 サポートしている範囲は "1000-01-01 00:00:00.000000" から "9999-12-31 23:59:59.999999" です。', baseQuery: 'DATETIME', category: 'timestamp', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'] }),
        new ColumnType({ id: 115, name: 'timestamp', description: 'タイムスタンプです。 範囲は "1970-01-01 00:00:01.000000" UTC から "2038-01-19 03:14:07.999999" UTC です。', baseQuery: 'TIMESTAMP', category: 'timestamp', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'] }),
        new ColumnType({ id: 122, name: 'datetime (p)', description: '日付と時間の組み合わせです。 サポートしている範囲は "1000-01-01 00:00:00.000000" から "9999-12-31 23:59:59.999999" です。', baseQuery: 'DATETIME[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['CURRENT_TIMESTAMP[[PARAM]]', 'CURRENT_TIMESTAMP[[PARAM]] ON UPDATE CURRENT_TIMESTAMP[[PARAM]]'] }),
        new ColumnType({ id: 125, name: 'timestamp (p)', description: 'タイムスタンプです。 範囲は "1970-01-01 00:00:01.000000" UTC から "2038-01-19 03:14:07.999999" UTC です。', baseQuery: 'TIMESTAMP[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false, defaultValueCandidates: ['CURRENT_TIMESTAMP[[PARAM]]', 'CURRENT_TIMESTAMP[[PARAM]] ON UPDATE CURRENT_TIMESTAMP[[PARAM]]'] }),
        new ColumnType({ id: 151, name: 'year', description: '4 桁形式の年。', baseQuery: 'YEAR', category: 'timestamp', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        new ColumnType({ id: 301, name: 'char', description: '格納時に必ず、指定された長さになるように右側がスペースで埋められる固定長文字列です。', baseQuery: 'CHAR', category: 'text', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 311, name: 'char (m)', description: '格納時に必ず、指定された長さになるように右側がスペースで埋められる固定長文字列です。', baseQuery: 'CHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 312, name: 'varchar (m)', description: '可変長文字列です。', baseQuery: 'VARCHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 321, name: 'tinytext', description: '最大長が 255 文字の TEXT カラム。', baseQuery: 'TINYTEXT', category: 'text', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 322, name: 'text', description: '最大長が 65,535 文字の TEXT カラム。', baseQuery: 'TEXT', category: 'text', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 323, name: 'text (m)', description: '最大長が 65,535 文字の TEXT カラム。', baseQuery: 'TEXT[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 324, name: 'mediumtext', description: '最大長が 16,777,215 文字の TEXT カラム。', baseQuery: 'MEDIUMTEXT', category: 'text', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 325, name: 'longtext', description: '最大長が 4G 文字の TEXT カラム。', baseQuery: 'LONGTEXT', category: 'text', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 3, name: 'binary (m)', description: 'バイナリバイト文字列を格納します。', baseQuery: 'BINARY[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 5, name: 'varbinary (m)', description: 'バイナリバイト文字列を格納します。', baseQuery: 'VARBINARY[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 361, name: 'tinyblob', description: '最大長が 255 バイトの BLOB カラム。', baseQuery: 'TINYBLOB', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 363, name: 'blob', description: '最大長が 65,535 バイトの BLOB カラム。', baseQuery: 'BLOB', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 364, name: 'blob (m)', description: '最大長が 65,535 バイトの BLOB カラム。', baseQuery: 'BLOB[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 365, name: 'mediumblob', description: '最大長が 16,777,215 バイトの BLOB カラム。', baseQuery: 'MEDIUMBLOB', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 367, name: 'longblob', description: '最大長が 4G バイトの BLOB カラム。', baseQuery: 'LONGBLOB', category: 'bit', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        new ColumnType({ id: 422, name: 'json', description: '文書の型式であるJSONデータを格納するために使用されるデータ型。', baseQuery: 'JSON', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        new ColumnType({ id: 2001, name: 'geometry', description: '空間データを格納するために使用されるデータ型。点、線、多角形、およびその他の形状を含めることができます。', baseQuery: 'GEOMETRY', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2011, name: 'point', description: 'GEOMETRYデータ型の1つであり、2次元空間上の単一の点を表します。', baseQuery: 'POINT', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2012, name: 'linestring', description: 'GEOMETRYデータ型の1つであり、2次元空間上の複数の点を結ぶ直線セグメントの連続したセットを表します。', baseQuery: 'LINESTRING', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2013, name: 'polygon', description: 'GEOMETRYデータ型の1つであり、2次元平面上の単一の領域を表す閉じたループの集合です。', baseQuery: 'POLYGON', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2021, name: 'multipoint', description: 'GEOMETRYデータ型の1つであり、複数の点を表す複数のPOINTオブジェクトの集合です。', baseQuery: 'MULTIPOINT', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2022, name: 'multilinestring', description: 'GEOMETRYデータ型の1つであり、複数の線分を表す複数のLINESTRINGオブジェクトの集合です。', baseQuery: 'MULTILINESTRING', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2023, name: 'multipolygon', description: 'GEOMETRYデータ型の1つであり、複数のポリゴンを表す複数のPOLYGONオブジェクトの集合です。', baseQuery: 'MULTIPOLYGON', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2031, name: 'geometrycollection', description: 'GEOMETRYデータ型の1つであり、複数のGEOMETRYオブジェクトの集合を表します。', baseQuery: 'GEOMETRYCOLLECTION', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        new ColumnType({ id: 2101, name: 'enum', description: '文字列のリストの中から1つを選択するために使用されるデータ型。', baseQuery: 'ENUM', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),
        new ColumnType({ id: 2102, name: 'set', description: 'ENUMの拡張版であり、文字列のリストから複数の選択肢を選択するために使用されるデータ型。', baseQuery: 'SET', category: 'other', withPrecision: false, withScale: false, withUnsigned: false, withAutoIncrement: false }),

        ColumnType.EMPTY
    ],

    // cSpell: ignore smallmoney datetimeoffset smalldatetime nvarchar ntext hierarchyid SYSDATETIME SYSUTCDATETIME SYSDATETIMEOFFSET
    "ms_sqlserver": [
        new ColumnType({ id: 1, name: 'bit', description: '1、0、またはNULLの値を受け取ることができる整数データ型。', baseQuery: 'BIT', category: 'bit', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 3, name: 'binary (n)', description: 'n バイトの固定長の binary データです。ここで、n は 1 から 8,000 の値になります。', baseQuery: 'BINARY[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 4, name: 'binary', description: '固定長の binary データです。', baseQuery: 'BINARY', category: 'bit', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 5, name: 'varbinary (n)', description: '可変長 binary データ。 n には 1 ～ 8,000 の値を指定できます。', baseQuery: 'VARBINARY[[PARAM]]', category: 'bit', withPrecision: true, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 9, name: 'varbinary (max)', description: '可変長 binary データ。', baseQuery: 'VARBINARY(MAX)', category: 'bit', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 10, name: 'tinyint', description: '整数データを使用する実数データ型です。0 to 255 (2^0-1 to 2^8-1)', baseQuery: 'TINYINT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true }),
        new ColumnType({ id: 11, name: 'smallint', description: '整数データを使用する実数データ型です。-32,768 to 32,767 (-2^15 to 2^15-1)', baseQuery: 'SMALLINT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true }),

        new ColumnType({ id: 15, name: 'int', description: '整数データを使用する実数データ型です。-2,147,483,648 to 2,147,483,647 (-2^31 to 2^31-1)', baseQuery: 'INT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true }),
        new ColumnType({ id: 17, name: 'bigint', description: '整数データを使用する実数データ型です。-9,223,372,036,854,775,808 to 9,223,372,036,854,775,807 (-2^63 to 2^63-1)', baseQuery: 'BIGINT', category: 'integer', withPrecision: false, withScale: false, withAutoIncrement: true }),

        new ColumnType({ id: 31, name: 'real', description: 'real の ISO シノニムは、 float (24) です。', baseQuery: 'REAL', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 33, name: 'float', description: '浮動小数点数値データで使用する概数型です。', baseQuery: 'FLOAT', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 35, name: 'decimal', description: '有効桁数と小数点以下桁数が固定された数値データ型です。', baseQuery: 'DECIMAL', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: true }),
        new ColumnType({ id: 36, name: 'numeric', description: '有効桁数と小数点以下桁数が固定された数値データ型です。decimal と numeric はシノニムであり、同じ意味で使用できます。', baseQuery: 'NUMERIC', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: true }),

        new ColumnType({ id: 42, name: 'float (n)', description: '浮動小数点数値データで使用する概数型です。', baseQuery: 'FLOAT[[PARAM]]', category: 'decimal', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 45, name: 'decimal (m, s)', description: '有効桁数と小数点以下桁数が固定された数値データ型です。', baseQuery: 'DECIMAL[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withAutoIncrement: false }),
        new ColumnType({ id: 46, name: 'numeric (m, s)', description: '有効桁数と小数点以下桁数が固定された数値データ型です。decimal と numeric はシノニムであり、同じ意味で使用できます。', baseQuery: 'NUMERIC[[PARAM]]', category: 'decimal', withPrecision: true, withScale: true, withAutoIncrement: false }),
        new ColumnType({ id: 47, name: 'decimal (m)', description: '有効桁数と小数点以下桁数が固定された数値データ型です。', baseQuery: 'DECIMAL[[PARAM]]', category: 'decimal', withPrecision: true, withScale: false, withAutoIncrement: true }),
        new ColumnType({ id: 48, name: 'numeric (m)', description: '有効桁数と小数点以下桁数が固定された数値データ型です。decimal と numeric はシノニムであり、同じ意味で使用できます。', baseQuery: 'NUMERIC[[PARAM]]', category: 'decimal', withPrecision: true, withScale: false, withAutoIncrement: true }),

        new ColumnType({ id: 65, name: 'smallmoney', description: '金額値または通貨値を表すデータ型。-214,748.3648 to 214,748.3647', baseQuery: 'SMALLMONEY', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 67, name: 'money', description: '金額値または通貨値を表すデータ型。-922,337,203,685,477.5808 to 922,337,203,685,477.5807', baseQuery: 'MONEY', category: 'decimal', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 101, name: 'date', description: '日付を定義します。', baseQuery: 'DATE', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 111, name: 'datetime2', description: '24 時間形式の時刻と組み合わせた日付を定義します。', baseQuery: 'DATETIME2', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['SYSDATETIME()', 'SYSUTCDATETIME()'] }),
        new ColumnType({ id: 112, name: 'datetimeoffset', description: 'datetime2 などの 24 時間制に基づいて 1 日の時刻と組み合わされる日付を定義し、協定世界時 (UTC) に基づいてタイム ゾーン認識を追加します。', baseQuery: 'DATETIMEOFFSET', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['SYSDATETIMEOFFSET()'] }),
        new ColumnType({ id: 121, name: 'datetime2 (p)', description: '24 時間形式の時刻と組み合わせた日付を定義します。', baseQuery: 'DATETIME2[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['SYSDATETIME()', 'SYSUTCDATETIME()'] }),
        new ColumnType({ id: 122, name: 'datetimeoffset (p)', description: 'datetime2 などの 24 時間制に基づいて 1 日の時刻と組み合わされる日付を定義し、協定世界時 (UTC) に基づいてタイム ゾーン認識を追加します。', baseQuery: 'DATETIMEOFFSET[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['SYSDATETIMEOFFSET()'] }),
        new ColumnType({ id: 131, name: 'time', description: '1 日の時刻を定義します。 時刻は 24 時間形式で、タイム ゾーンは認識されません。', baseQuery: 'TIME', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 141, name: 'time (s)', description: '', baseQuery: 'TIME[[PARAM]]', category: 'timestamp', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 191, name: 'smalldatetime (deprecated)', description: '(deprecated)', baseQuery: 'SMALLDATETIME', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['GETDATE()', 'GETUTCDATE()'] }),
        new ColumnType({ id: 192, name: 'datetime (deprecated)', description: '(deprecated)', baseQuery: 'DATETIME', category: 'timestamp', withPrecision: false, withScale: false, withAutoIncrement: false, defaultValueCandidates: ['GETDATE()', 'GETUTCDATE()'] }),

        new ColumnType({ id: 301, name: 'char', description: '固定サイズの文字データ型です。', baseQuery: 'CHAR', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 302, name: 'varchar', description: '可変サイズの文字データ型です。', baseQuery: 'VARCHAR', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 306, name: 'nchar', description: '固定サイズの文字列データです。', baseQuery: 'NCHAR', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 307, name: 'nvarchar', description: '可変サイズの文字列データです。 ', baseQuery: 'NVARCHAR', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 311, name: 'char (n)', description: '固定サイズの文字データ型です。', baseQuery: 'CHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 312, name: 'varchar (n)', description: '可変サイズの文字データ型です。', baseQuery: 'VARCHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 316, name: 'nchar (n)', description: '固定サイズの文字列データです。', baseQuery: 'NCHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 317, name: 'nvarchar (n)', description: '可変サイズの文字列データです。 ', baseQuery: 'NVARCHAR[[PARAM]]', category: 'text', withPrecision: true, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 325, name: 'varchar (max)', description: '可変サイズの文字データ型です。', baseQuery: 'VARCHAR(MAX)', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 326, name: 'nvarchar (max)', description: '可変サイズの文字列データです。 ', baseQuery: 'NVARCHAR(MAX)', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 395, name: 'text (deprecated)', description: '(deprecated)', baseQuery: 'TEXT', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 396, name: 'ntext (deprecated)', description: '(deprecated)', baseQuery: 'NTEXT', category: 'text', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 397, name: 'image (deprecated)', description: '(deprecated)', baseQuery: 'IMAGE', category: 'bit', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 422, name: 'json', description: 'The native json data type that stores JSON documents in a native binary format.', baseQuery: 'JSON', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 431, name: 'xml', description: 'XML データを格納するデータ型です。', baseQuery: 'XML', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 453, name: 'vector', description: 'vector データ型は、類似性検索や機械学習アプリケーションなどの操作用に最適化されたベクトル データを格納するように設計されています。', baseQuery: 'VECTOR', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 2001, name: 'geometry', description: '平面空間データ型の geometry は、SQL Server では共通言語ランタイム (CLR) のデータ型として実装されています。 この型は、ユークリッド (平面) 座標系のデータを表します。', baseQuery: 'GEOMETRY', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 2002, name: 'geography', description: '地理空間データ型の geography は、SQL Server では .NET 共通言語ランタイム (CLR) のデータ型として実装されています。 この型は、球体地球座標系のデータを表します。', baseQuery: 'GEOGRAPHY', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 2061, name: 'hierarchyid', description: 'hierarchyid データ型は可変長のシステム データ型です。 hierarchyid は、階層内の位置を表すために使用します。', baseQuery: 'HIERARCHYID', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),

        new ColumnType({ id: 9301, name: 'uniqueidentifier', description: '16 バイトの GUID です。', baseQuery: 'UNIQUEIDENTIFIER', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),
        new ColumnType({ id: 9302, name: 'sql_variant', description: 'SQL Server でサポートしている各種データ型の値が格納されます。', baseQuery: 'SQL_VARIANT', category: 'other', withPrecision: false, withScale: false, withAutoIncrement: false }),

        ColumnType.EMPTY
    ]
};

export const findDatabaseColumns = (databaseType: DatabaseType): ColumnType[] => databaseColumns[databaseType];

export const migrateColumns = (databaseType: DatabaseType, orgColumnTypes: ColumnType[], orgVersion: number) => {
    const latestColumnTypeMap = new Map(
        findDatabaseColumns(databaseType).map(columnType => [columnType.id, columnType])
    );

    let nextColumnTypes = orgColumnTypes;

    // orgVersion < 20250612 : ColumnType に defaultValueCandidates プロパティを追加
    // orgVersion < 20260321 : ColumnType の defaultValueCandidates プロパティに動的項目を追加
    if (orgVersion < 20260321) {
        nextColumnTypes = nextColumnTypes.map(columnType => {
            const latestColumnType = latestColumnTypeMap.get(columnType.id);
            if (latestColumnType == null) {
                return columnType;
            }

            return ColumnType.migrateDefaultValueCandidates(columnType, latestColumnType, orgVersion);
        });
    }

    // PostgreSQL の場合、OID カラムを追加
    if ((orgVersion < 20250718) && (databaseType === "postgres")) {
        const oidColumnType = latestColumnTypeMap.get(9103);
        if ((oidColumnType != null)
            && nextColumnTypes.every(columnType => columnType.id !== 9103)) {
            nextColumnTypes.push(oidColumnType);
        }
    }

    // PostgreSQL の場合、GENERATED ALWAYS AS IDENTITY の定義を追加
    if ((orgVersion < 20251130) && (databaseType === "postgres")) {
        nextColumnTypes = nextColumnTypes.map(columnType => {
            const latestColumnType = latestColumnTypeMap.get(columnType.id);
            if (latestColumnType == null) {
                return columnType;
            }

            if (!latestColumnType.withAutoIncrement) {
                return columnType;
            }

            return new ColumnType({
                ...columnType,
                withAutoIncrement: true
            });
        });
    }

    // orgVersion < 20260504 : ColumnType に category プロパティを追加
    if (orgVersion < 20260504) {
        nextColumnTypes = nextColumnTypes.map(columnType => {
            const latestColumnType = latestColumnTypeMap.get(columnType.id);
            if (latestColumnType == null) {
                return columnType;
            }

            return new ColumnType({
                ...columnType,
                category: latestColumnType.category
            });
        });
    }

    return nextColumnTypes;
};