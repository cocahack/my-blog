---
title: 운영중인 상태에서 DDL을 적용하는 방법
date: "2021-09-26T05:46:50Z"
template: "post"
draft: false
slug: "13"
category: "Database"
tags:
  - "Database"
  - "MySQL"
description: "운영중인 환경에서 서비스를 중단하지 않고 DDL을 적용하는 방법을 알아보았다."
---

## MySQL에서의 DDL

InnoDB 스토리지 엔진을 사용한다고 가정했을 때, DDL을 실행하면 테이블 락이 걸린다. 이런 특성때문에, 운영환경에서 DDL을 실행하면 테이블 락으로 인해 다른 쿼리들이 락이 풀릴 때까지 대기해야하는 일이 발생할 수 있다.

## 라이브 상태에서 DDL 적용하기 - 온라인 DDL

> 스토어드 프로시저나 함수, Database, 테이블 등을 생성하거나 변경하는 기능 등의 명령이 DDL이다.

MySQL의 경우, 5.5 버전까지는 테이블의 구조를 변경하는 동안에는 다른 커넥션에서 DML을 실행할 수 없었다. 또한 5.5 이후에도 온라인 DDL의 성능이나 안정성 문제로 잘 사용하지 않았다.

그러나 8.0 부터 대부분의 스키마 변경 작업은 MySQL 서버에 내장된 온라인 DDL 기능으로 처리가 가능해졌다.

### 알고리즘

온라인 DDL을 사용하면 스키마를 변경하는 작업 도중에도 다른 커넥션에서 해당 테이블의 데이터를 변경하거나 조회하는 작업이 가능하다. 

온라인 DDL 명령의 예시는 다음과 같다.

```sql
ALTER TABLE salaries CHANGE to_date end_date DATE NOT NULL, ALGORITHM=INPLACE, LOCK=NONE;
```

MySQL의 시스템 변수 중 `old_alter_tabla`이라는 변수가 있는데, 이전 방식으로 DDL을 진행할지와 관련된 변수이다. 8.0부터는 이 변수의 기본 값이 `OFF`이므로 자동으로 온라인 DDL이 적용된다. 

`ALTER TABLE` 명령을 실행하면 MySQL 서버는 다음의 순서로 스키마 변경에 적합한 알고리즘을 찾는다.

1. `ALGORITHM=INSTANT`로 스키마 변경이 가능한지 확인 후, 가능하면 선택
2. `ALGORITHM=INPLACE`로 스키마 변경이 가능한지 확인 후, 가능하면 선택
3. `ALGORITHM=COPY` 선택

각 옵션 값의 내용은 다음과 같다.

- `INSTANT`: 테이블의 데이터는 변경하지 않고, 메타데이터만 변경하고 작업을 완료한다. 테이블이 가진 레코드 개수와 상관없이 작업 시간이 짧다는 특징이 있다. 스키마를 변경하는 동안 READ, WRITE는 대기하게 되지만 변경하는 시간 자체가 짧기 때문에 큰 영향을 미치지는 않는다.
- `INPLACE`: 임시테이블로 데이터를 복사하지 않고 스키마 변경을 실행한다. 그러나 내부적으로는 테이블의 리빌드를 실행할 수도 있다. 레코드의 복사 작업은 없지만 테이블의 모든 레코드를 리빌드해야 하기 때문에 테이블 크기에 따라 많은 시간이 소요될 수도 있다. 하지만 스키마 변경 중에도 테이블의 읽기와 쓰기가 모두 가능하다. 알고리즘에 의해 스키마가 변경되는 경우에도 최초 시작 시점과 마지막 종료 시점에는 읽고 쓰기가 불가능하다. 하지만 이 시간은 매우 짧기 때문에 큰 영향을 미치지는 않는다.
- `COPY`: 변경된 스키마를 적용한 임시 테이블을 생성하고, 테이블의 레코드를 모두 임시 테이블로 복사한 후 최종적으로 임시 테이블의 이름을 변경해서 스키마 변경을 완료한다. 이 방법을 사용하면 읽기만 가능하고 DML을 실행할 수 없다.

<br>

`LOCK` 옵션을 사용하여 잠금 수준을 설정할 수도 있다. 설정하지 않으면 MySQL 서버가 알아서 적절한 잠금 수준을 적용한다.

`INSTANCE` 알고리즘은 테이블의 메타데이터만 잠그기 때문에 `LOCK` 옵션을 명시할 수 없다. `INPLACE`나 `COPY` 알고리즘을 사용할 때만 `LOCK` 옵션을 쓸 수 있다.

옵션 값은 다음과 같다.

- `NONE`: 잠금을 걸지 않는다.
- `SHARED`: 읽기 잠금을 걸고 스키마 변경을 실행한다. 읽기만 가능하다.
- `EXCLUSIVE`: 쓰기 잠금을 걸고 스키마 변경을 실행한다. 읽기와 쓰기가 모두 불가능하다.

## 라이브 상태에서 DDL 적용하기 - *PT-ONLINE-SCHEMA-CHANGE*

**Percona**에서 개발한 툴로 락 없이 `ALTER` 명령어를 실행하게 해준다.

동작 방식은 MySQL 내장 온라인 DDL의 `INPLACE`와 비슷하다. 테이블을 복사해서 구조를 변경하며, 기존 테이블은 여전히 읽기와 쓰기가 가능하다. 같은 테이블 구조를 가지는 테이블을 데이터 없이 하나 만들고 DDL을 적용한 다음, 데이터를 복사한다. 작업이 마무리되면 기존 테이블에서 새로운 테이블로 이전한다. 기본 동작은 기존 테이블을 제거하는 것이다.

보다 자세한 내용은 [공식 문서](https://www.percona.com/doc/percona-toolkit/3.0/pt-online-schema-change.html)에서 확인할 수 있다.
