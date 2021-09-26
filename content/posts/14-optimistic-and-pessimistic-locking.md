---
title: 비관적 락과 낙관적 락
date: '2021-09-26T07:21:16Z'
template: 'post'
draft: false
slug: '14'
category: 'Theory'
tags:
  - 'Theory'
  - 'Synchronization'
description: '비관적 락과 낙관적 락에 대해 정리'
---

## 비관적 락

데이터베이스에서 데이터를 검색할 때, 간혹 다른 작업이 검색 작업에 영향을 주지 않도록 통제하고 싶을 때가 있다.

이런 상황에서는 **적절한 트랜잭션 격리 수준을 설정**하거나 **검색할 데이터를 잠그는 것**이 그 방법이다.

특히, 다른 트랜잭션이 데이터를 건드릴 수 없도록 비관적 락을 사용할 수 있다. 락에는 Exclusive lock과 shared lock이 있다. Shared lock을 보유하고 있다면 다른 곳에서 데이터를 읽을 수는 있으나 쓸 수는 없다. Exclusive lock을 보유하고 있다면 다른 곳에서 데이터를 읽거나 쓰기 위해 락이 해제될 때까지 기다린다.

### JPA에서의 비관적 락 모드 

JPA에서는 비관적 락 모드 세 가지를 제공한다.

- `PESSIMISTIC_READ`: Shared lock을 획득한다.
- `PESSIMISTIC_WRITE`: Exclusive lock을 획득한다.
- `PESSIMISTIC_FORCE_INCREMENT`: `PESSIMISTIC_WRITE`처럼 작동하지만, 버전을 사용하는 엔티티의 버전을 증가시키는 차이가 있다.

## 낙관적 락

### JPA에서의 낙관적 락

낙관적 락을 사용하려면 `@Version` 애노테이션이 붙은 속성을 포함하는 엔티티가 필요하다. 데이터를 읽는 각 트랜잭션은 이 버전 속성 값을 사용하게 된다. 트랜잭션은 업데이트하기 전에 버전 속성을 확인하며, 버전이 번경되었다면 `OptimisticLockException`이 발생한다. 버전이 변경되지 않았다면 트랜잭션을 커밋하고 버전 속성의 값을 증가시킨다.

### 비관적 락과 비교

낙관적 락은 버전 속성을 사용하여 엔티티의 변경 사항을 감지하는 것을 기반으로 구현된다. 이러한 동작은 수정, 삭제 등이 읽기 작업보다 더 빈번하게 발생하는 애플리케이션에 적합하다. 레코드를 수정하기 위해 락을 사용하는 오버헤드를 피할 수 있기 때문이다. 또한, 일정 시간동안 엔티티가 분리되어야 하고 잠금을 유지할 수 없는 상황에서도 유용하다.

반면 비관적 락은 데이터베이스 수준에서 엔티티를 잠그는 것과 관련이 있다. 한 트랜잭션이 비관적 락을 획득했다면, 다른 트랜잭션은 락이 반납될 때까지 기다려야 한다. 비관적 락은 교착 상태가 발생할 수 있지만, 낙관적 잠금보다 더 강한 데이터 무결성을 보장한다.

## References

- [Pessimistic Locking in JPA - Baeldung](https://www.baeldung.com/jpa-pessimistic-locking)
- [Optimistic Locking in JPA - Baeldung](https://www.baeldung.com/jpa-optimistic-locking)
- [Optimistic and pessimistic record locking - IBM](https://www.ibm.com/docs/en/rational-clearquest/7.1.0?topic=clearquest-optimistic-pessimistic-record-locking)
