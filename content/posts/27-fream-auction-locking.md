---
title: 입찰 테이블의 무결성 문제 해결하기
date: "2022-01-14T06:02:32Z"
template: "post"
draft: false
slug: "27"
category: "fream"
tags:
  - "토이프로젝트"
  - "fream"
description: "Kream 앱에 존재하는 입찰 제약 조건을 토이 프로젝트에서 구현한 과정을 정리했다."
---

## 발단

Kream 클론 코딩을 진행하면서, 입찰 기능을 구현하던 도중 어떤 제약조건을 구현해야하는 일이 생겼다.

Kream에서 발생하는 모든 거래는 입찰 등록으로부터 시작된다. 상품의 특정 사이즈에 구매 입찰(Bid) 또는 판매 입찰(Ask)을 등록해야 하는 것이다. 이렇게 입찰이 등록되면, 등록된 입찰의 금액으로 '즉시 거래'가 성사될 수 있다.

### 입찰의 제약 조건

그런데 여기에는 제약 조건이 존재한다. 두 가지 케이스로 나누면 다음과 같다.

1. 구매 입찰(Bid)을 등록할 때, 판매 입찰(Ask)의 최저가보다 높은 금액으로 등록할 수 없다.
2. 판매 입찰(Ask)을 등록할 때, 구매 입찰(Bid)의 최고가보다 낮은 금액으로 등록할 수 없다.

실제로 Kream 앱을 키고 아무 상품이나 눌러서 위의 상황을 시도해보면 자동으로 금액이 재설정된다. 이런 제약 조건을 Fream에서도 구현해보고 싶었다.

## Fream의 입찰 데이터 구조

입찰을 `auction` 이라는 테이블로 나타냈으며, 구조는 다음과 같다. 

![auction table](/media/2022-14-01/1.png)

구매 입찰과 판매 입찰이 `auction` 한 테이블에 존재한다. 이를 구별할 때 `type` 컬럼을 사용한다. 각 입찰에는 입찰가 `price`와 입찰 대상인 상품 및 사이즈의 id(각각 `product_id`, `size_id`) 가 포함되어 있다.

### 무결성이 깨지는 상황 분석

위에서 언급한 두 조건이 깨지는 상황은 다음과 같다. 

- 직전 최고 구매가보다 높은 구매 입찰과 직전 최저 판매가보다 낮은 판매 입찰이 동시에 생성되는 경우
  ![1번 상황](/media/2022-14-01/2.jpg)
- (즉시 판매/즉시 구매)와 (직전 최저 판매가보다 낮은 판매 입찰/직전 최고 구매가보다 낮은 구매 입찰) 생성이 동시에 이뤄지는 경우
  ![2번 상황](/media/2022-14-01/3.jpg)

> 위에서 언급되는 입찰은 모두 같은 상품과 사이즈 id를 가진다고 가정한다.

만약 위와 같은 상황에서 제대로 된 동시성 처리가 되지 않는다면 무결성이 깨질 위험이 있다.

### 무결성이 유지될 수 있도록 기능 구현하기

이런 상황을 방지하려면 입찰 등록과 즉시 판매/구매 기능에 락을 사용해야 한다. 락 없이 애플리케이션에서 INSERT 또는 UPDATE를 사용하기 전에 입찰 목록을 조회해서 검사하는 방식으로는 무결성을 유지할 수 없기 때문이다.

입찰을 조회하는 쿼리는 다음과 같다.

```sql
SELECT *
FROM auction
WHERE `type` = ?
    AND product_id = ?
    AND size_id = ?
;
```

이 쿼리는 INSERT 또는 UPDATE 전에 실행하여 무결성 조건을 확인할 때 사용될 것이다. 따라서 쓰기 락을 걸어서 트랜잭션이 끝나기 전까지 다른 트랜잭션이 건드릴 수 없게 만들어야 한다.

```sql
SELECT *
FROM auction
WHERE `type` = ?
    AND product_id = ?
    AND size_id = ?
FOR UPDATE
;
```

#### 락 범위 좁히기

`auction` 테이블의 DDL을 보면 다음과 같다.

```sql
create table auction
(
    id          bigint auto_increment
        primary key,
    type        varchar(5)                         not null comment '입찰 타입 - 판매 입찰(ASK), 구매 입찰(BID), 완료된 입찰(SALES)',
    price       decimal(19, 2)                     not null,
    product_id  bigint                             not null,
    size_id     bigint                             not null,
    user_id     bigint                             not null,
    created_at  datetime default CURRENT_TIMESTAMP not null,
    due_date    datetime                           not null comment '입찰 마감 기한',
    canceled_at datetime                           null comment '입찰 취소한 시각',
    signed_at   datetime                           null comment '거래 체결된 시각',
    bidder_id   bigint                             null comment '낙찰자의 ID'
);
```

PK 외에 다른 인덱스는 걸어두지 않은 상태다. 이 상태에서 아까 작성한 쿼리를 사용하면 문제가 된다. 

트랜잭션에서 쿼리를 실행하고 락에 걸린 데이터들을 확인해보면 다음과 같다.

```sql
SELECT COUNT(*) FROM performance_schema.data_locks
WHERE ENGINE_TRANSACTION_ID = 52490
    AND LOCK_DATA != 'supremum pseudo-record'
;
```

이 결과는 정확히 `auction` 테이블의 레코드 개수와 일치한다. 즉, 쿼리에 필요한 인덱스가 없어 검색 대상에 모든 레코드가 포함되었고 그 레코드들에 record lock이 걸린 것이다. 

```sql
SELECT COUNT(*) AS RECORDS FROM performance_schema.data_locks
WHERE ENGINE_TRANSACTION_ID = 52490
    AND LOCK_DATA != 'supremum pseudo-record'
UNION ALL
SELECT COUNT(*) FROM auction
;
```

![쿼리 결과 1](/media/2022-14-01/4.png)

필요한 부분만 락을 걸기 위해서는 인덱스를 걸어줘야 한다. 그러면 어느 컬럼에 락을 걸어야 할까? 

위에서 언급했던 두 가지 상황 중 1번 상황에 초점을 맞춰야 한다. 

> 1. 직전 최고 구매가보다 높은 구매 입찰과 직전 최저 판매가보다 낮은 판매 입찰이 동시에 생성되는 경우
> 2. (즉시 판매/즉시 구매)와 (직전 최저 판매가보다 낮은 판매 입찰/직전 최고 구매가보다 낮은 구매 입찰) 생성이 동시에 이뤄지는 경우

판매 입찰을 생성한다면 구매 입찰의 레코드를 확인하면 되고, 구매 입찰을 생성한다면 판매 입찰의 레코드를 보면 된다. 하지만 이렇게 한 타입의 레코드에만 락을 걸게 되면 1번 상황처럼 동시에 생성되는 경우를 막을 수 없다.

예를 들면, 등록된 입찰 데이터가 다음과 같이 쌓여 있고,

| id | type | price | product\_id | size\_id |
| :--- | :--- | :--- | :--- | :--- |
| 2718 | ASK | 559000.00 | 50 | 16 | 9 | 
| 2708 | ASK | 557000.00 | 50 | 16 | 9 | 
| 2712 | ASK | 553000.00 | 50 | 16 | 1 | 
| 2715 | ASK | 550000.00 | 50 | 16 | 4 | 
| 2742 | BID | 542000.00 | 50 | 16 | 3 | 
| 2743 | BID | 538000.00 | 50 | 16 | 3 | 
| 2744 | BID | 538000.00 | 50 | 16 | 6 | 
| 2759 | BID | 538000.00 | 50 | 16 | 4 | 

그리고 1번 조건에 해당하는 구매 입찰과 판매 입찰을 생성하는 요청이 동시에 애플리케이션에 들어왔다고 하자.

| 세션 1 | 세션 2 | 
| :--- | :--- |
| BEGIN;  |  | 
| SELECT * FROM auction WHERE type = 'BID' AND product_id = 50 AND size_id = 16 FOR UPDATE;  |  | 
|  | BEGIN; | 
|  | SELECT * FROM auction WHERE type = 'ASK' AND product_id = 50 AND size_id = 16 FOR UPDATE; | 
| INSERT INTO auction(type, price, product_id, size_id, ...) VALUES('ASK', 539000, 50, 16, ...); |  | 
|  | INSERT INTO auction(type, price, product_id, size_id, ...) VALUES('BID', 542000, 50, 16, ...); | 
| COMMIT; |  | 
|  | COMMIT; | 

무결성 조건을 확인하는 역할은 애플리케이션에 구현된 비즈니스 로직이 담당할 것이다. 그렇다면 트랜잭션에서 실행되는 입찰 조회 쿼리는 먼저 조회를 실행한 트랜잭션의 작업이 끝난 뒤에 이뤄져야 무결성 조건이 제대로 확인될 것이다.

즉, 위의 예시에서는 세션 1에서 `SELECT ... FOR UPDATE` 쿼리가 실행되면 세션 2에서의 `SELECT ... FOR UPDATE` 쿼리는 세션 1에서 트랜잭션이 끝날 때까지 기다려야 한다.

따라서 타입 구분없이 **상품 ID와 사이즈 ID 기준**으로 락을 잡아야 한다. 인덱스를 생성하는 DDL은 다음과 같다.

```sql
create index auction_product_id_size_id_index
       	on auction (product_id, size_id)
;
```

##### 결과 확인

이제 같은 쿼리를 실행해보면 필요한 레코드에만 락이 걸리게 된다.

```sql
SELECT *
FROM auction
WHERE type = 'ASK'
    AND product_id = 50
    AND size_id = 16
FOR UPDATE
;

SELECT ENGINE_TRANSACTION_ID, OBJECT_NAME, LOCK_DATA, type, price
FROM auction A,
     (
         SELECT ENGINE_TRANSACTION_ID, OBJECT_NAME, LOCK_DATA, TRIM(SUBSTRING_INDEX(LOCK_DATA, ',', -1)) AS auction_id
         FROM performance_schema.data_locks
         WHERE INDEX_NAME = 'auction_product_id_size_id_index'
     ) B
WHERE A.id = B.auction_id
ORDER BY A.price DESC
;
```

`SELECT ... FOR UPDATE` 실행 후 인덱스로 걸린 레코드 락 데이터와 `auction` 테이블을 조인하여 확인해보면 아래와 같이 결과가 나온다. 필요한 데이터만 락이 걸리게 된다.

| ENGINE\_TRANSACTION\_ID | OBJECT\_NAME | LOCK\_DATA | type | price |
| :--- | :--- | :--- | :--- | :--- |
| 52533 | auction | 50, 16, 2718 | ASK | 559000.00 |
| 52533 | auction | 50, 16, 2708 | ASK | 557000.00 |
| 52533 | auction | 50, 16, 2712 | ASK | 553000.00 |
| 52533 | auction | 50, 17, 2702 | ASK | 552000.00 |
| 52533 | auction | 50, 16, 2715 | ASK | 550000.00 |
| 52533 | auction | 50, 16, 2703 | ASK | 547000.00 |
| 52533 | auction | 50, 16, 2697 | ASK | 546000.00 |
| 52533 | auction | 50, 16, 2717 | ASK | 545000.00 |
| 52533 | auction | 50, 16, 2742 | BID | 542000.00 |
| 52533 | auction | 50, 16, 2743 | BID | 538000.00 |
| 52533 | auction | 50, 16, 2744 | BID | 538000.00 |
| 52533 | auction | 50, 16, 2759 | BID | 538000.00 |
| 52533 | auction | 50, 16, 2740 | BID | 534000.00 |
| 52533 | auction | 50, 16, 2732 | BID | 529000.00 |
| 52533 | auction | 50, 16, 2745 | BID | 528000.00 |

#### `SELECT ... FOR UPDATE` 의 한계

그러나 위의 방법은 문제가 있다. `SELECT ... FOR UPDATE`는 조회에 사용한 레코드에 락을 걸고 `REPEATABLE READ` 에서의 PHANTOM READ를 방지하기 위해 넥스트 키 락을 사용한다. 그런데 이 모든 것의 전제 조건은 레코드가 있어야 한다는 것이다. 존재하지 않는 레코드에 락을 걸 수 없기 때문에, 레코드가 없으면 넥스트 키 락도 사용할 수 없다.

따라서 위에서 생각했던 인덱스는 (product_id, size_id) 조합의 `auction` 레코드가 한 건이라도 존재해야 동작한다.

실제 동작을 확인해보기 위해 `auction` 테이블의 모든 레코드를 지우고 같은 쿼리를 실행해봤는데, 락이 걸리지 않았다.

<figure>
    <img src="/media/2022-14-01/5.png" alt="쿼리 결과 2">
    <figcaption>좌측에서 먼저 쿼리를 실행했는데, 우측에서 대기 없이 쿼리가 바로 실행되는 모습</figcaption>
</figure>

아직 존재하지 않는 레코드에 락을 걸 수 있는지 찾아보았다. 

[How do I lock on an InnoDB row that doesn't exist yet?](https://stackoverflow.com/questions/17068686/how-do-i-lock-on-an-innodb-row-that-doesnt-exist-yet)

테이블 락을 사용하거나 [뮤텍스 테이블](https://www.xaprb.com/blog/2005/09/22/mutex-tables-in-sql/)을 만들어 활용하는 등의 방법이 나오는데, 이런 방법들을 사용하면 원하는 기능을 구현할 수 있지만, 락 범위가 너무 크다는 것이 부담스러웠다. 

#### 해결 방안

결국 레코드 락으로는 해결할 수 없다는 문제라는 것을 깨달았으니, 다른 도구를 활용하면 되겠다고 생각했다. 생각한 방법은 두 가지가 있었다.

1. MySQL의 Named Lock 사용
2. 별도의 락 테이블 사용

첫 번째 방법은 [기술 블로그](https://techblog.woowahan.com/2631/)에서 봤던 내용을 떠올려 생각한 방법이다. 그러나 동작 방식에 따른 이슈로 이 방법은 택하지 않았다.

`GET_LOCK()` 과 `RELEASE_LOCK()`이 트랜잭션과는 별개로 동작하기 때문에 트랜잭션 시작 전, 종료 후 각각 `GET_LOCK()`과 `RELEASE_LOCK()`을 호출해줘야 하는 문제점이 있었다. 이를 구현하기 위해서 `@Transactional` 을 사용하지 않고 직접 `Connection` 객체를 가져와서 `try-with-resource`로 비즈니스 로직을 묶는 방식을 사용해야 할 것 같았고, 그렇게 되면 코드의 복잡도가 올라갈 것으로 예상했다. 

또, 다른 커넥션에서 명시적으로 `RELEASE_LOCK()`을 호출하면 락이 바로 해제된다는 점도 주의해야 했다. 

이런 이유로, 락 획득을 트랜잭션에 속하게 만들 수 있는 2번 방법을 택했다. `auction` 테이블의 레코드를 변경하기 전에, 락 테이블의 (product_id, size_id) 조합의 레코드에 쓰기 락을 걸도록 구현했다.

락 테이블은 다음과 같은 구조로 결정했다. 

```sql
create table auction_lock_by_product_id_and_size_id
(
    product_id bigint not null,
    size_id    bigint not null,
    primary key (product_id, size_id)
);
```

#### 코드 작업

##### `LockManager` 구현

락을 획득하려면 락 테이블에 레코드가 없으면 생성한 다음, 레코드에 X Lock을 걸어주는 작업을 해줘야 한다. 이러한 작업을 하나의 인터페이스로 노출하기 위해 `LockManager`를 따로 두었다.

```Java
@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class AuctionLockManager {

    private final AuctionLockByProductIdAndSizeIdMapper lockMapper;

    public void lock(Long productId, Long sizeId) {
        lockMapper.tryInsertRecord(productId, sizeId);
        lockMapper.getLock(productId, sizeId);
    }
}
```

`tryInsertRecord()`에서 락에 사용할 레코드를 삽입하는 역할을 한다. `INSERT IGNORE INTO`를 사용해서 레코드가 이미 있을 때 에러가 발생하지 않도록 처리했다.

그런 다음, `getLock()`에서 `SELECT ... FOR UPDATE`를 사용해 (product_id, size_id) 쌍의 레코드 한 건을 잠근다.

또한 해당 컴포넌트는 전파 수준을 `MANDATORY`로 사용해, 반드시 다른 트랜잭션이 있어야만 동작하게 만들었다.

##### `AuctionService` 수정

서비스 레이어에서는 입찰을 생성할 때와 거래가 성사되었을 때 락을 사용하도록 코드를 삽입해야 한다.

```java
@Service
@RequiredArgsConstructor
@Transactional
public class AuctionService {

    // ...

    public AuctionDto createAuction(AuctionRequest request) {
        lockManager.lock(request.getProductId(), request.getSizeId());

        Auction auction = request.getType().constructor.apply(request);

        Product product = productService.getProduct(request.getProductId());
        Size size = product.getSize(request.getSizeId());
        User user = userMapper.getUserById(request.getUserId());

        auction.setProduct(product);
        auction.setSize(size);
        auction.setUser(user);

        auctionMapper.create(auction);

        return convert(auction);
    }

}
```

입찰 생성은 기존 비즈니스 로직의 첫 부분에 락을 사용하는 코드를 삽입하는 것으로 제약 조건이 적용되었다.

```java
@Service
@RequiredArgsConstructor
@Transactional
public class AuctionService {

    // ...

    public SignAuctionResponse sign(User bidder, Long auctionId) {
        Auction auction = auctionMapper.getAuction(auctionId);

        lockManager.lock(auction.getProduct().getId(), auction.getSize().getId());

        return signHelper(bidder, auctionId);
    }

    private SignAuctionResponse signHelper(User bidder, Long auctionId) {
        Auction auction = auctionMapper.getAuctionForUpdate(auctionId);

        auction.sign(bidder);
        auctionMapper.update(auction);

        return modelMapper.map(auction, SignAuctionResponse.getTypeObject());
    }

}
```

거래는 `product_id`와 `size_id`를 알 수 없으므로 우선 레코드를 가져온 다음 락을 건다. 그런 다음, 대상이 되는 입찰에도  `SELECT ... FOR UPDATE`를 사용해 동시에 같은 입찰에 거래되는 것을 방지했다.

---

## Appendix: Gap lock, Next-key lock 추가 조사

### GAP Lock의 존재 확인 

레코드 락과 `auction` 테이블을 조인하여 얻은 결과를 잘 보면 `(product_id, size_id, PK)` 조합이 다른 것이 있다. 

```text
52533, auction, '50, 17, 2702', ASK, 552000.00 
```

쿼리에서 `product_id`와 `size_id`에 사용한 값은 각각 50과 16이지만, `(50, 17, PK)` 조합으로 락이 걸린 레코드가 존재하는 것이다. 

`performance_schema.data_locks` 테이블에서 같은 `Lock_DATA` 를 가진 레코드를 조회해보면 다음과 같은 결과를 얻을 수 있다.

```
+-----------+--------------------------------+---------+------------+
|OBJECT_NAME|INDEX_NAME                      |LOCK_MODE|LOCK_DATA   |
+-----------+--------------------------------+---------+------------+
|...        |...                             |...      |...         |
|auction    |auction_product_id_size_id_index|X        |50, 16, 2745|
|auction    |auction_product_id_size_id_index|X        |50, 16, 2759|
|auction    |auction_product_id_size_id_index|X,GAP    |50, 17, 2702|
+-----------+--------------------------------+---------+------------+

```

다른 레코드들과 달리 `LOCK_MODE`에 `GAP` 이라는 모드가 추가된 것을 볼 수 있다. `(50, 16, PK)` 조합에 대해 쓰기 락을 걸었기 때문에 인덱스 사이에 다른 레코드가 생성될 수 없도록 막아주는 것이다. 

### `supremum pseudo-record`

본문의 중간쯤에 `supremum pseudo-record` 값을 제외하는 WHERE 조건을 넣은 쿼리를 적은 적이 있다. 이 값은 `performance_schema.data_locks` 테이블을 조회할 때, 일부 레코드의 `LOCK_DATA` 컬럼의 값이 `supremum pseudo-record` 였기 때문에 제외한 것이다.

`supremum pseudo-record`는 무엇일까? MySQL 공식 문서에서 개념을 알 수 있었다.

위에서 갭 락을 위해 `(50, 17, PK)` 조합의 레코드 하나가 락에 포함된 것을 확인했다. 그러면 반대로 `(50, 16, PK)` 보다 작은 범위의 삽입을 막기 위해서도 갭락이 필요한 것이다. 

즉, 

```
(negative infinity, '50, 16, 2697']
('50, 16, 2697', '50, 16, 2759']
('50, 16, 2759', '50, 17, 2702']
```

인덱스 구간이 다음과 같고, 첫 번째 범위에서 시작 값을 실제 인덱스 레코드가 아닌 가짜 레코드를 사용한 것이다. 이는 Next-Key Lock을 위한 장치이며, `REPEATABLE READ` 격리 수준에서 발생할 수 있는 Phantom rows 현상을 제거하기 위함이다.

[MySQL 문서](https://dev.mysql.com/doc/refman/5.6/en/innodb-locking.html#innodb-next-key-locks)
