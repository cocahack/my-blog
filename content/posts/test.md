---
title: 테스트
date: '2021-10-11T07:21:16Z'
template: 'post'
draft: true
slug: '100'
category: "Database"
tags:
  - "Database"
  - "MySQL"
description: 'MySQL의 옵티마이저와 실행 계획을 살펴본다.'
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

#### 결과 테이블 분석

##### `id` 컬럼

단위 SELECT 쿼리별로 부여되는 식별자 값이다.

##### `select_type` 컬럼
    
###### `SIMPLE`

`UNION` 이나 서브 쿼리를 사용하지 않는 단순한 SELECT 쿼리. `SIMPLE` 타입 쿼리는 반드시 하나이며, 일반적으로 제일 바깥 쿼리이다.

###### `PRIMARY`

`UNION` 이나 서브 쿼리가 포함된 SELECT 쿼리의 실행 계획에서 가장 바깥쪽에 있는 단위 쿼리. `SIMPLE` 과 마찬가지로 `PRIMARY` 단위 SELECT 쿼리는 하나만 존재하며, 쿼리의 제일 바깥 쪽에 있는 SELECT 단위 쿼리가 `PRIMARY` 로 표시된다.

###### `UNION`

`UNION`으로 결합하는 단위 SELECT 쿼리 중 첫 번째를 제외한 두 번째 이후 단위 SELECT 쿼리는 `UNION` 타입으로 표시된다.

###### `DEPENDENT UNION` 

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

###### `UNION RESULT`

UNION의 결과를 담아두는 테이블을 의미한다. `UNION ALL` 이나 `UNION (DISTINCT)` 쿼리는 모두 UNION의 결과를 임시 테이블로 생성하는데, 실행 계획상 이 임시 테이블을 가리키는 레코드의 `select_type`이 바로 `UNION RESULT` 이다. 실제 쿼리에서의 단위 쿼리가 아니므로 id 값은 부여되지 않는다.

###### `SUBQUERY` 

`select_type` 의 `SUBQUERY`는 FROM 절 이외에서 사용되는 서브 쿼리만을 의미한다.

> 서브 쿼리는 사용되는 위치에 따라 각각 다른 이름을 지닌다.
>
> - `Nested query`: SELECT 되는 컬럼에 사용된 서브 쿼리
> - `Sub query`: WHERE 절에 사용되었다면 서브 쿼리라고 부른다.
> - `Derived`: FROM 절에 사용된 서브 쿼리를 MySQL에서는 파생 테이블이라고 부른다. 일반적인 RDB에서는 인라인 뷰 또는 서브 셀렉트라고 부르기도 한다. 
>
> 또한 서브 쿼리가 반환하는 값의 특성에 따라 구분하기도 한다.
> - `Scalar Sub query`: 컬럼이 단 하나인 레코드 한 건만 반환하는 쿼리
> - `Row Sub query`: 컬럼 개수에 관계없이 하나의 레코드만 반환하는 쿼리

###### `DEPENDENT SUBQUERY`

서브 쿼리가 바깥쪽 SELECT 쿼리에서 정의된 컬럼을 사용하는 경우이다.

###### `DERIVED` 

서브 쿼리가 FROM 절에 사용된 경우 MySQL은 항상 `select_type`이 `DERIVED`인 실행 계획을 만든다. 

`DERIVED`는 단위 SELECT 쿼리의 실행 결과를 메모리나 디스크에 임시 테이블을 생성하는 것을 의미한다. 이런 임시 테이블을 파생 테이블이라고도 한다.
MySQL은 이런 테이블을 제대로 최적화하지 못하며, 인덱스가 전혀 없으므로 조인 시 성능상 불리할 때가 많다. 가능하면 `DERIVED` 형태의 실행 계획을 조인으로 해결할 수 있게 바꿔주는 것이 좋다. 

###### `UNCACHEABLE SUBQUERY``

하나의 쿼리 문장에서 서브 쿼리가 하나만 이ㅆ

## References
