---
title: MySQL 파티션
date: "2021-10-16T12:12:38Z"
template: "post"
draft: false
slug: "17"
category: "Database"
tags:
  - "Database"
  - "MySQL"
description: "파티션의 정의와 그 종류, 그리고 중요한 내용을 요약 정리했다."
---

## 파티션 

파티션을 사용하게 되면 유저 입장에서는 하나의 테이블로 보이지만, 실제로는 여러 테이블로 분리해서 저장한다. 

### 쿼리 동작 방식

#### INSERT

파티션 expression에 따라 파티션 테이블을 선택한 다음, 그 테이블에 삽입한다.

#### UPDATE

변경 대상 레코드를 우선 검색해야 한다. WHERE 조건에 파티션 키 컬럼이 포함되어 있다면 파티션 프루닝을 이용할 수 있다.

파티션 위치가 변하지 않는다면 레코드만 수정한다. 그러나 파티션 위치가 변경되어야 한다면, 현재 파티션에서의 레코드를 제거하고, 새로운 파티션에 레코드를 복사한 다음 UPDATE를 실행한다.

#### SELECT

- WHERE 절의 조건으로 파티션을 선택할 수 있는가? (파티션 키 컬럼이 WHERE 절에 포함되어 있는가?)
- WHERE 절의 조건이 인덱스를 효율적으로 사용(인덱스 레인지 스캔)할 수 있는가?

위 두 가지 조건이 빠른 검색에 영향을 미치는 주요인이라고 할 수 있다.

### 파티션 테이블의 인덱스

파티션 테이블에서 인덱스는 로컬 인덱스이다. 즉, 파티션 테이블마다 인덱스가 있으며 모든 테이블을 아우르는 글로벌 인덱스가 없다는 뜻이다. 사실 파티션을 쓰는 이유 중 하나가 비대해진 인덱스의 크기를 줄이는 것도 목적 중 하나라고 할 수 있는데, 글로벌 인덱스를 쓰면 이런 장점이 없어지기 때문에 지원하지 않는 것이라고 볼 수 있다.

파티션 테이블에서 인덱스를 사용해 범위 검색을 수행한 뒤 정렬을 할 때는 일반 테이블과 동작 방식이 다르다. 일반 테이블에서는 이미 정렬된 상태이지만, 파티션된 테이블은 그 파티션 테이블에서만 인덱스로 정렬된 상태이기 때문이다. 그러나 MySQL에서는 file sort를 사용하지 않는데, 이는 우선순위 큐를 사용하여 Merge & Sort를 수행하기 때문이다.

### 파티션 생성 시 주의 사항 

#### 유니크 키

프라이머리 키를 포함해서, 유니크 키를 가지는 모든 테이블에는 파티션을 생성할 때 제약 조건이 있다. 파티션이 적용된 테이블에서도 유일성을 보장하기 위해 키가 존재하는지 확인하는 작업을 한다면, 어느 파티션을 봐야할지 바로 알 수 있어야 효율적으로 중복 확인을 할 수 있을 것이다. 때문에 MySQL에서는 유니크 키 전체 혹은 일부를 포함한 컬럼에만 파티션을 적용할 수 있다.

```sql
# [1503] 에러 발생 - id 프라이머리 키가 포함되지 않음
create table product (
    id int auto_increment,
    name varchar(100) not null,
    release_date date null,
    constraint product_pk
        primary key (id)
    )
    PARTITION BY RANGE (YEAR(release_date)) (
        PARTITION p2020 VALUES LESS THAN (2020),
        PARTITION p2021 VALUES LESS THAN (2021),
        PARTITION p_inf VALUES LESS THAN (MAXVALUE)
    )
;

# 생성 가능
create table product (
        id int not null ,
        name varchar(100) not null,
        release_date date null
    ) 
    PARTITION BY RANGE (YEAR(release_date)) (
        PARTITION p2020 VALUES LESS THAN (2020),
        PARTITION p2021 VALUES LESS THAN (2021),
        PARTITION p_inf VALUES LESS THAN (MAXVALUE)
    )
;

```

[MySQL Docs - Partitioning Keys, Primary Keys, and Unique Keys](https://dev.mysql.com/doc/refman/8.0/en/partitioning-limitations-partitioning-keys-unique-keys.html)

#### 그 밖에..

위의 유니크 키 말고도 여러 제약 조건이 존재한다. 자세한 내용은 공식 문서를 참고하자.

[MySQL Docs - Chapter 6 Restrictions and Limitations on Partitioning](https://dev.mysql.com/doc/mysql-partitioning-excerpt/5.7/en/partitioning-limitations.html)

### 정리

1. 인덱스 크기가 너무 커져서 읽기, 쓰기 작업의 성능이 나빠질 때(특히 쓰기 작업) 파티션을 사용할 수 있다.
    - 인덱스는 검색 대상으로 사용될 때 SELECT, UPDATE, DELETE 에 영향을 주고, INSERT, UPDATE, DELETE 등 변경 작업이 발생하면 인덱스를 조정하는 부가 작업이 필요하다. 이런 작업들은 인덱스가 커지면 커질수록 성능이 나빠질 수 밖에 없다. 특히 인덱스의 크기가 실질적인 물리 메모리보다 커지게 되면 문제가 발생한다.  
    이런 상황에서 파티션을 사용하면 효과적이다.
    - 파티션을 적용한다고 해서 읽기 작업의 성능이 항상 좋아지는 것은 아니다. 읽기보다는 쓰기 성능 때문에 주로 사용한다고 생각하면 된다.
2. 읽기 또는 쓰기 작업을 특정 파티션으로 모으는 것이 가능한 테이블에 파티션 적용을 고려해 볼 수 있다.
3. 로그성 데이터와 같이 레인지 파티션을 쓸 수 있는 경우에는 쓰는 것이 관리적인 측면에서 좋다.
    - 단일 테이블에서 특정 기간의 데이터를 삭제 또는 백업을 한다고 할 때, 테이블 크기가 크다면 작업이 꽤나 부담스럽다. 게다가 삭제의 경우, 실제 테이블의 크기는 감소하지 않는다.  
    파티션을 적용했다면 특정 기간의 데이터를 `DROP PARTITION` 으로 쉽게 제거할 수 있다. 또한 삭제 작업의 부하도 줄일 수 있다.

