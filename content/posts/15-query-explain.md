---
title: MySQL 실행 계획 분석하는 방법
date: '2021-09-26T07:21:16Z'
template: 'post'
draft: false
slug: '15'
category: "Database"
tags:
  - "Database"
  - "MySQL"
description: 'MySQL의 실행 계획 테이블을 살펴보고, 각 컬럼이 의미하는 바를 확인하여 실행 계획을 해석하는 방법을 배웠다.'
---

## 들어가기 전에..

### 쿼리 실행 절차

MySQL 서버에서 쿼리가 실행되는 과정은 다음과 같다.

1. 유저가 요청한 SQL 문을 파싱한다. (SQL 파싱)
2. 파싱 결과인 Parse Tree를 확인하면서 어떤 테이블부터 읽고 어떤 인덱스를 이용해 데이터를 읽을지 선택한다. (최적화 및 실행 꼐획 수립 - 옵티마이저가 처리)
3. 두 번째 단계에서 결정된 테이블의 읽기 순서나 선택된 인덱스를 이용해 스토리지 엔진으로부터 데이터를 가져온다.

### 통계 정보

대부분의 DB에서 옵티마이저는 비용 기반 최적화를 사용한다. 비용 기반 최적화에서 가장 중요한 것은 통계 정보이다. 통계 정보를 바탕으로 비용을 측정하기 때문에 실제 테이블의 내용과 통계 정보가 불일치하는 경우 잘못된 실행 계획을 뽑을 수도 있다.

필요한 경우, `ANALYZE` 명령을 사용해 통계 정보를 강제적으로 갱신할 수 있다. 그러나 InnoDB 스토리지 엔진에서 이 명령을 사용하면 테이블의 읽기, 쓰기가 불가능하므로 운영 중일 때 사용해서는 안된다.

## 실행 계획 분석

실행 계획을 확인하는 방법은 세 가지가 있다.

1. `EXPLAIN`
2. `EXPLAIN EXTENDED`
3. `EXPLAIN PARTITIONS`

### `EXPLAIN` 을 사용한 실행 계획

`EXPLAIN` 과 함께 쿼리를 사용하면 테이블 형태로 된 결과를 출력한다. 테이블에 출력되는 레코드는 임시 테이블을 포함하여 사용한 테이블의 개수만큼 출력된다.
위쪽에 출력된 결과일 수록 쿼리의 바깥 부분 또는 먼저 접근한 테이블이다.

#### 실행 결과 분석

```sql
SELECT p.id           AS id,
       p.name         AS name,
       p.english_name AS english_name,
       p.category     AS category,
       p.product_code AS product_code,
       p.release_date AS release_date,
       p.retail_price AS retail_price,
       b.id           AS brand_id,
       b.name         AS brand_name,
       b.english_name AS brand_english_name,
       s.id           AS size_id,
       s.name         AS size_name
FROM (SELECT *
      FROM product
      WHERE MATCH(name, english_name) AGAINST('\"pants\"' IN BOOLEAN MODE)
        AND category IN ('BOTTOM')
        AND id IN (SELECT C.product_id
                   FROM (SELECT COUNT(*) cnt, product_id
                         FROM product_size
                         WHERE size_id IN (20, 21)
                         GROUP BY product_id) AS C
                   WHERE C.cnt = 2)
        AND brand_id IN (1, 6)
      LIMIT 10 OFFSET 0) AS p
         JOIN brand AS b ON p.brand_id = b.id
         JOIN product_size ps ON p.id = ps.product_id
         JOIN size s ON s.id = ps.size_id
;
```

이 쿼리의 실행 계획을 출력하면 다음과 같은 결과가 나온다.

| id | select\_type | table | partitions | type | possible\_keys | key | key\_len | ref | rows | filtered | Extra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | PRIMARY | &lt;derived2&gt; | NULL | ALL | NULL | NULL | NULL | NULL | 2 | 100 | NULL |
| 1 | PRIMARY | b | NULL | eq\_ref | PRIMARY | PRIMARY | 8 | p.brand\_id | 1 | 100 | NULL |
| 1 | PRIMARY | ps | NULL | ref | PRIMARY,size\_id | PRIMARY | 8 | p.id | 12 | 100 | Using index |
| 1 | PRIMARY | s | NULL | eq\_ref | PRIMARY | PRIMARY | 8 | fream.ps.size\_id | 1 | 100 | NULL |
| 2 | DERIVED | product | NULL | fulltext | PRIMARY,brand\_id,fx\_keywords | fx\_keywords | 0 | const | 1 | 5.88 | Using where; Ft\_hints: no\_ranking |
| 2 | DERIVED | &lt;derived4&gt; | NULL | ref | &lt;auto\_key0&gt; | &lt;auto\_key0&gt; | 8 | fream.product.id | 2 | 100 | FirstMatch\(product\) |
| 4 | DERIVED | product\_size | NULL | range | PRIMARY,size\_id | size\_id | 8 | NULL | 10 | 100 | Using where; Using index; Using temporary |

각 컬럼마다 어떤 의미를 갖는지 확인해보자.

##### `id` 컬럼

해당 컬럼의 의미와 특징을 정리하면 다음과 같다.

- 단위 SELECT 쿼리별로 부여되는 식별자 값이다. 
- 서브쿼리를 사용했다면, 가장 바깥쪽 SELECT가 1이 된다. 
- 여러 개의 테이블을 조인하면 조인되는 테이블의 개수만큼 실행 계획 레코드가 출력되지만, 부여된 id는 SELECT 문의 id와 같다.

이 내용으로 위의 실행 결과를 해석해보자. 

위의 예시에서는 1, 2, 4번 ID가 채번되었다. 가장 안쪽의 서브쿼리가 4번, 4번을 감싼 서브쿼리가 2번, 가장 바깥쪽 SELECT 문이 1번인 것을 볼 수 있다. id 1번에는 JOIN 테이블 정보도 같이 포함되어 있다.

##### `select_type` 컬럼

각 단위 SELECT 쿼리의 타입을 나타낸다. 

타입의 종류는 다음과 같다.

- `SIMPLE`: `UNION` 이나 서브 쿼리를 사용하지 않는 단순한 SELECT 쿼리. `SIMPLE` 타입 쿼리가 존재한다면 반드시 하나만 존재한다. 일반적으로 제일 바깥에 위치한다.
- `PRIMARY`: `UNION` 이나 서브 쿼리가 포함된 SELECT 쿼리의 실행 계획에서 가장 바깥쪽에 있는 단위 쿼리. `SIMPLE` 과 마찬가지로 `PRIMARY` 단위 SELECT 쿼리는 하나만 존재하며, 쿼리의 제일 바깥 쪽에 있는 SELECT 단위 쿼리가 `PRIMARY` 로 표시된다. 위 예시에서도 바깥쪽 SELECT 문이 `PRIMARY`으로 표시된 것을 볼 수 있다.
- `UNION`: `UNION`으로 결합하는 단위 SELECT 쿼리 중 첫 번째를 제외한 두 번째 이후 단위 SELECT 쿼리는 `UNION` 타입으로 표시된다.
- `DEPENDENT UNION`: UNION 이나 UNION ALL로 결합된 단위 쿼리가 외부로부터 영향을 받는 것을 의미한다. `DEPENDENT` 가 붙은 타입이면 모두 외부에 영향을 받는다고 생각하면 된다. (보다 자세한 내용은 [아래](#details---dependent-union) 내용 참고)
- `UNION RESULT`: `UNION` 결과를 담아두는 테이블을 의미한다. 단위 쿼리가 아니므로 `id` 값은 부여되지 않는다.
- `SUBQUERY`: 여러 서브쿼리 종류 중에서 FROM 절 이외에 사용되는 서브 쿼리를 의미한다. 
- `DEPENDENT SUBQUERY`: `DEPENDENT UNION`와 비슷하게, 서브 쿼리가 바깥쪽 SELECT 쿼리에서 정의된 컬럼을 사용하는 경우이다.
- `DERIVED`: 서브 쿼리가 FROM 절에 사용된 경우이다.  
MySQL 5.5 버전까지는 Derived 테이블을 최적화하지 못했다. 그러나 5.6 버전부터는 옵티마이저 옵션(`optimizer_switch` 시스템 변수)에 따라 FROM 절의 서브쿼리를 외부 쿼리와 통합하는 형태의 최적화를 수행하거나, 임시 테이블에 인덱스를 추가해줄 수 있게 되었다. 8.0 버전 부터는 불필요한 서브쿼리는 조인으로 재작성하는 최적화를 지원한다.  
최적화 기능이 존재한다고 해도, 옵티마이저가 최적화하는데는 한계가 있으므로 JOIN을 쓸 수 있는 상황이라면 JOIN을 쓰는 것이 좋다.
- `UNCACHEABLE SUBQUERY`: 서브 쿼리는 조건이 같으면 이전 실행 결과를 그대로 사용할 수 있게 캐시된다. 그러나 `UNCACHEABLE SUBQUERY` 타입이라면 캐시가 불가능하다. 사용자 변수(`@`로 시작하는), NOT_DETERMINISTIC 속성의 스토어드 루틴 사용, `UUID()`, `RAND()` 와 같이 결과 값이 항상 다른 함수가 포함된 경우가 대표적이다.  
> 여기에서 언급한 캐시는 쿼리 캐시나 파생 테이블과는 전혀 관계가 없다.
- `UNCACHEABLE UNION`: `UNCACHEABLE SUBQUERY` 와 비슷한 타입이다.


###### Details - `DEPENDENT UNION` 

UNION 이나 UNION ALL로 결합된 단위 쿼리가 외부로부터 영향을 받는 것을 의미한다. 

다음의 쿼리를 보면

```sql
SELECT e.first_name,
  (
    SELECT CONCAT('Salary change count : ', COUNT(*)) AS message
      FROM salaries s WHERE s.emp_no = e.emp_no
    UNION
    SELECT CONCAT('Department change count : ', COUNT(*)) AS message
      FROM dept_emp de WHERE de.emp_no = e.emp_no
  ) AS message
FROM employees e
WHERE e.emp_no = 10001;
```

서브 쿼리가 외부에 정의된 employees 테이블의 emp_no를 참조하고 있다. 이런 경우가 `DEPENDENT UNION`에 해당한다. 

하나의 단위 SELECT 쿼리가 다른 단위 SELECT를 포함하고 있을 때 이를 서브쿼리라고 한다. 서브쿼리는 외부 쿼리보다 먼저 실행되는 것이 일반적이며, 반대의 경우보다 빠르게 처리된다. 하지만 위의 예시처럼 외부 테이블에 의존하는 경우에는 반드시 외부 쿼리가 먼저 실행되기 때문에 대부분의 경우 `DEPENDENT` 가 붙어있다면 비효율적이라고 생각하면 된다.

##### `table` 컬럼

MySQL의 실행 계획은 단위 SELECT 쿼리 기준이 아니라 테이블 기준으로 표시된다. 테이블에 별칭이 있다면 별칭으로 표기되고, 그렇지 않으면 원래 테이블 이름을 쓴다. 별도 테이블을 사용하지 않는 쿼리는 `(NULL)` 로 출력된다. 

그 밖에 `<derived>` 나 `<union>` 같이 "<>" 로 둘러싸인 이름이 있는데, 이런 것들은 임시 테이블을 의미한다.

##### `type` 컬럼

각 테이블에 접근하는 방식으로 해석하면 된다. 많이 사용되는 것 중 성능이 좋은 순서대로 나열하면 다음과 같다.

- `system`: 레코드가 한 건 또는 한 건도 없는 테이블을 참조하는 형태의 접근 방법이다. InnoDB에는 `ALL` 또는 `index`로 표시된다.
- `const`: 테이블 레코드 개수에 관계없이 쿼리가 프라이머리 키나 유니크 키 컬럼을 이용하는 WHERE 조건이 사용되고, 반드시 1건만 반환하는 쿼리의 처리 방식이다. 다른 DBMS에서는 유니크 인덱스 스캔이라고도 표현한다.  
```sql
SELECT * FROM employees WHERE emp_no = 10001; 
```
- `eq_ref`: 여러 테이블이 조인되는 쿼리의 실행 계획에서만 표시된다. 조인에서 처음 읽은 테이블의 컬럼 값을 그다음 읽어야 할 테이블의 PK나 유니크 키 컬럼의 검색 조건에 사용할 때를 `eq_ref` 라고 한다. 이때 두 번째 이후에 읽는 테이블의 type 컬럼에 `eq_ref`가 표시된다.  
조인에서 두 번째 이후에 읽는 테이블에서 반드시 1건만 존재한다는 보장이 있을 때 사용할 수 있다.  
위의 예시에서, `brand` 테이블과 `size` 테이블을 조인할 때 `eq_ref` 타입이 적용되었는데, 조인 조건으로 도출된 레코드가 한 건이기 때문에 `eq_ref`가 적용되었음을 알 수 있었다.
- `ref`: `eq_ref`와 달리 조인 순서에 관계없이 사용되며, PK나 유니크 키 제약 조건도 없다. 인덱스 종류와 관계없이 동등 조건으로 검색할 때 이 방법이 사용된다. 레코드가 반드시 1건이라는 보장은 없다.
- `fulltext`: 전문 검색 인덱스를 사용해 레코드를 읽는 접근 방법이다. 옵티마이저는 전문 인덱스를 사용할 수 있는 쿼리에서는 비용에 관계없이 `fulltext`를 선택하는 경향이 있다. 일반 인덱스를 이용하는 `range`가 더 빨리 처리되는 경우가 많으므로, 전문 검색 쿼리를 사용할 때는 각 조건별로 성능을 확인해보는 것이 좋다.
- `ref_or_null`: `ref` 접근 방식과 같으나 `NULL` 비교가 추가된 형태이다.
- `unique_subquery`: `IN (subquery)` 형태의 쿼리에서, 서브쿼리가 유일한 값을 반환할 때 이 접근 방식을 사용한다.
- `index_subquery`: `IN (subquery)` 형태의 서브쿼리가 중복된 값을 반환할 수 있지만, 인덱스로 중복을 제거할 수 있을 때 이 접근 방식이 사용된다.
- `range`: 인덱스 레인지 스캔 형태의 접근 방식이다. 인덱스를 사용해 범위 검색을 할 때 사용되는 접근 방식으로, '<', '>', 'IS NULL', 'BETWEEN', 'IN', 'LIKE' 등의 연산자가 이에 해당한다. 우선순위는 낮지만, 이 방식도 상당히 빠르다.
- `index_merge`: 두 개 이상의 인덱스를 이용해 각각의 검색 결과를 만든 후, 그 결과를 병합하는 방식이다.
- `index`: 인덱스 풀 스캔을 사용한 접근 방식이다. range 방식이 인덱스의 필요한 부분만 읽는 것이므로, range 보다 느린 방식이다.  
풀 테이블 스캔 방식과 비교했을 때 비교하는 레코드 건수는 같지만, 일반적으로 인덱스가 데이터 파일 전체보다는 크기가 작으므로 효율적이다. 또한 쿼리의 내용에 따라 정렬된 인덱스의 장점을 이용할 수 있으므로 풀 테이블 스캔보다 효율적으로 처리될 수도 있다. 그러나 읽어야 하는 레코드 수가 많다면 풀 테이블 스캔이 더 빠를 수 있다.
- `ALL`: 풀 테이블 스캔 접근 방식을 의미한다.

##### `possible_keys` 컬럼

옵티마이저가 실행 계획을 만들 때 후보로 선정했던 접근 방식에서 사용되는 인덱스 목록을 뜻한다. 실제 튜닝에는 관련이 없는 항목이다.

##### `key` 컬럼

실행 계획에서 실제로 선택된 인덱스를 뜻한다. 값이 `PRIMARY` 면 PK를 사용했다는 뜻이며, 그 외에는 모두 인덱스의 고유 이름이 출력된다.

실행 계획의 타입이 `ALL`이면 인덱스를 사용하지 못한 것이므로 `NULL`로 표기된다.

##### `key_len` 컬럼

다중 컬럼으로 구성된 인덱스에서 몇 개의 컬럼(더 정확히는 인덱스의 각 레코드에서 몇 바이트까지 사용했는지)까지 사용했는지를 알려준다. 

##### `ref` 컬럼

`ref` 방식으로 접근했을 때, Equal 비교 조건으로 어떤 값이 제공됐는지 보여 준다.

간혹 이 컬럼의 값이 `func` 인 경우가 있는데, 조인 조건에 표현식을 사용해 임의로 값을 변경하거나, MySQL 서버가 내부적으로 값을 변환할 때 ref 칼럼에 `func`가 출력된다. 

##### `rows` 컬럼

실행 계획의 효율성 판단을 위해 예측했던 레코드 건수를 보여준다. 이 값은 스토리지 엔진별로 가지고 있는 통계 정보를 참조해 MySQL 옵티마이저가 산출해 낸 예상 값이다. 또힌 이 값은 반환하는 레코드의 예상 건수가 아니라, 쿼리를 처리하기 위해 디스크에서 읽어와야하는 레코드 건수를 의미한다. 

`LIMIT` 가 포함된 쿼리는 표시되는 값의 오차가 심한 경우가 있어, 크게 도움이 되지는 않는다.

##### `Extra` 컬럼

성능과 관련된 중요한 내용이 이 컬럼에 출력된다. 
