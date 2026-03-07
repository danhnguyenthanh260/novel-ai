# Tài liệu nghiệp vụ toàn hệ thống Studio

## 1. Mục đích của tài liệu này

Tài liệu này mô tả toàn bộ hệ thống `Studio` theo góc nhìn nghiệp vụ và vận hành.

Mục tiêu của tài liệu là:

- giúp người chưa biết gì về dự án hiểu Studio đang làm gì
- giúp operator mới biết vào màn nào trước
- giúp người không biết code vẫn hình dung được các pipeline chính
- giúp người không biết viết truyện vẫn thao tác đúng luồng
- giúp phân biệt dữ liệu nguồn, dữ liệu tạm, dữ liệu đã duyệt và dữ liệu public
- giúp hiểu database đang giữ cái gì và vì sao phải giữ tách lớp

Tài liệu này không nhằm:

- giải thích source code
- giải thích implementation theo file
- chép API payload
- thay thế tài liệu dành cho developer backend/frontend

## 2. Cách đọc tài liệu này

Nếu bạn là người mới hoàn toàn, hãy đọc theo thứ tự:

1. Tổng quan hệ thống
2. Đường đi cơ bản cho người mới
3. Glossary
4. Các màn hình chính
5. Pipeline vận hành
6. Input, output và artifact
7. Database nghiệp vụ
8. Phụ lục nâng cao

Nếu bạn chỉ cần thao tác nhanh:

- cần nạp nguồn: đọc phần `Ingest`
- cần viết: đọc phần `Write`
- cần hiểu vì sao hệ thống chưa cho viết tiếp: đọc phần `Analysis` và `Canon guard`
- cần xử lý lore mâu thuẫn: đọc phần `Memory`
- cần chỉnh cấu trúc câu chuyện: đọc phần `Map`
- cần apply quyết định của người kiểm duyệt: đọc phần `Reviews`

## 3. Studio là gì

Studio là một hệ thống vận hành truyện nhiều lớp.

Nó không chỉ là một editor để gõ văn bản.

Nó cũng không chỉ là một giao diện gọi LLM.

Về bản chất, Studio là một môi trường sản xuất nội dung có kiểm soát, nơi:

- tài liệu nguồn được đưa vào
- chapter được chuẩn hoá
- chapter được tách thành scene
- scene được viết và sửa nhiều vòng
- dữ liệu lore được trích xuất và quản lý
- cấu trúc câu chuyện được map ra thành beat, arc, thread
- phân tích được tạo để giảm sai lệch khi viết tiếp
- review của con người được ghi nhận và có thể áp dụng thành quyết định
- lớp public được tách ra để giới thiệu và đọc

## 4. Studio không phải là gì

Studio không phải:

- một CMS thuần để đăng truyện
- một công cụ viết truyện chỉ có một ô text editor
- một công cụ review đơn thuần
- một knowledge base thuần túy
- một bảng Kanban quản lý task

Studio là tổ hợp của tất cả các lớp trên, nhưng được nối với nhau thành pipeline.

## 5. Ai dùng Studio

### 5.1. Operator mới

Người này cần biết:

- bắt đầu từ đâu
- story đang ở giai đoạn nào
- chapter đang nằm ở lớp dữ liệu nào
- nên dùng màn nào để làm việc tiếp

### 5.2. Narrative operator

Người này cần biết:

- scene nào cần viết
- chapter nào đang ở staging
- analysis hiện tại có đủ sạch để viết tiếp chưa
- review nào cần áp dụng

### 5.3. Memory hoặc lore operator

Người này cần biết:

- fact nào vừa được trích ra
- fact nào đã duyệt
- conflict nào đang chờ xử lý
- timeline và canon đang mâu thuẫn ở đâu

### 5.4. Story architect hoặc biên tập cấu trúc

Người này cần biết:

- chapter đang đẩy arc nào
- scene nào thiếu beat
- thread nào bị bỏ quên
- map đang ở working version hay active version

### 5.5. Người onboard dự án

Người này không cần thao tác ngay nhưng cần hiểu:

- toàn bộ hệ thống có những khối nào
- mỗi khối dùng để làm gì
- dữ liệu đi qua những tầng nào
- vì sao có nhiều vùng dữ liệu nhìn giống nhau nhưng lại không được gộp

## 6. Luồng làm việc cơ bản cho người mới

Luồng mặc định:

`Shelf -> chọn story -> Pipelines/Ingest -> Write -> Analysis -> Memory -> Map -> Reviews -> Publish/Read`

Giải thích ngắn:

- `Shelf` để chọn story
- `Story landing` để hiểu story đang có gì
- `Pipelines` để biết hệ thống có khoẻ hay không
- `Ingest` để đưa nguồn vào
- `Write` để làm nội dung
- `Analysis` để lấy ngữ cảnh sạch trước khi viết
- `Memory` để quản lore và conflict
- `Map` để quản cấu trúc
- `Reviews` để áp dụng quyết định của con người
- `Read` để xem lớp public

## 7. Nếu bạn muốn làm X thì vào đâu

| Nhu cầu | Vào đâu |
| --- | --- |
| Tạo story mới | `Shelf` |
| Chỉnh thông tin giới thiệu story | `Story landing` hoặc `Settings` |
| Upload file nguồn | `Ingest` |
| Xem worker có chạy không | `Pipelines` hoặc header worker state |
| Duyệt split chapter | `Ingest` |
| Viết scene | `Write` scene mode |
| Làm việc ở cấp chapter | `Write` chapter mode |
| Chạy viết tự động | `Write` với `AutoWrite` |
| Kiểm tra chapter đã đủ sạch để viết tiếp chưa | `Analysis` |
| Xử lý lore/canon/timeline | `Memory` |
| Chỉnh beat, arc, thread | `Map` |
| Nhận review và quyết định lock hay rewrite | `Reviews` |
| Xem trải nghiệm đọc | `Story landing` và `Read` |

## 8. Ba lớp lớn của hệ thống

### 8.1. Lớp quản trị story

Lớp này quản:

- định danh story
- metadata public
- tag, caution
- cover, background, ảnh
- language, prompt, tone profile
- chapter title
- arc gắn với chapter

Nếu không có lớp này, hệ thống không có điểm neo chung cho tất cả pipeline khác.

### 8.2. Lớp sản xuất nội dung

Lớp này quản:

- ingest nguồn vào
- split chapter/scene
- write ở cấp scene
- write ở cấp chapter
- AutoWrite
- staging
- commit
- resplit
- lock/unlock

Đây là lớp operator dùng thường xuyên nhất.

### 8.3. Lớp kiểm soát chất lượng và tri thức

Lớp này quản:

- canon guard
- analysis
- memory
- conflict review
- map
- human review

Đây là lớp giảm rủi ro viết sai, quên chi tiết, hoặc làm lệch cấu trúc câu chuyện.

## 9. Glossary

### 9.1. Story

`story` là đơn vị lớn nhất mà operator quản lý.

Một story có:

- slug
- title
- status
- metadata public
- chapter
- scene
- memory
- map
- review
- public surface

### 9.2. Chapter

`chapter` là khối nội dung ở cấp chương.

Một chapter có thể tồn tại ở nhiều lớp:

- như nguồn thô
- như source doc
- như split draft
- như chapter staging
- như tập scene
- như reader payload

Điều quan trọng là:

chapter không phải lúc nào cũng đã là scene.

### 9.3. Scene

`scene` là đơn vị vận hành chính của lớp viết.

Scene thường là nơi:

- draft
- evaluate
- rewrite
- review
- lock

Scene có trạng thái sống riêng.

### 9.4. Scene version

`scene version` là từng lần biến đổi nội dung của một scene.

Mỗi lần:

- outline
- draft
- rewrite

đều có thể tạo ra một version mới.

Điểm quan trọng:

- scene là thực thể ổn định
- scene version là lịch sử của scene

### 9.5. Staging

`staging` là vùng tạm.

Trong Studio, staging thường nói tới:

- prose cấp chapter
- plan cấp chapter
- trạng thái “đang chuẩn bị chốt” nhưng chưa trở thành scene chính thức

### 9.6. Analysis snapshot

Đây là ảnh chụp phân tích của hệ thống tại một thời điểm.

Nó dùng để:

- đánh giá độ sạch của fact
- đánh giá mức sẵn sàng để viết
- gom open loops
- gom lore debt
- sinh truth context pack

### 9.7. Memory

`memory` là lớp tri thức của story.

Bao gồm:

- fact
- timeline
- canon
- lore
- conflict
- memory đã vet

### 9.8. Map

`map` là lớp cấu trúc.

Bao gồm:

- scene order
- beat
- arc
- thread
- coverage

Map không phải prose.

### 9.9. Review

`review` là phản hồi của con người có thể áp dụng thành quyết định nghiệp vụ.

Decision thường là:

- lock
- rewrite

### 9.10. Public / published

Đây là lớp dữ liệu dành cho:

- shelf
- landing page
- reader

Nó tách khỏi lớp vận hành để tránh lẫn draft tạm với lớp trình bày ra ngoài.

## 10. Các cặp dễ nhầm

### 10.1. `scene` và `scene version`

`scene` là vật thể vận hành.

`scene version` là từng phiên bản nội dung của scene đó.

Hệ quả:

- review thường gắn với scene version
- lock thường áp vào scene
- history phải đọc ở scene version

### 10.2. `chapter scenes` và `chapter staging`

`chapter scenes` là chapter đã được biểu diễn thành tập scene.

`chapter staging` là prose hoặc plan tạm ở cấp chapter.

Hệ quả:

- staging chưa phải lớp scene chính thức
- scene mới là đơn vị ổn định hơn cho write/review/history

### 10.3. `analysis workspace` và `memory hub`

`analysis workspace` dùng để tạo snapshot cho quyết định hiện tại.

`memory hub` dùng để quản kho tri thức lâu dài.

### 10.4. `map` và `write`

`map` tổ chức cấu trúc.

`write` tạo prose.

### 10.5. `review` và `analysis`

`analysis` là lớp đánh giá của hệ thống.

`review` là lớp phản hồi và quyết định của con người.

### 10.6. `canon fact` và `story canon fact`

`canon fact` gần với bằng chứng cục bộ rút ra từ scene/version.

`story canon fact` gần với tri thức cấp story đã được chấp nhận dùng lâu hơn.

## 11. Các màn hình chính

### 11.1. Shelf

#### Vào đây để làm gì

- xem story đang có
- chọn story để mở
- tạo story mới

#### Không phải để làm gì

- không phải nơi xử lý chapter hoặc scene
- không phải nơi xem worker detail

#### Người mới cần hiểu gì

Đây là cửa vào của hệ thống.

Nếu bạn không biết bắt đầu ở đâu, bắt đầu ở đây.

### 11.2. Story landing

#### Vào đây để làm gì

- xem tổng quan story
- xem metadata
- xem chapter
- xem arc
- chỉnh các thông tin public

#### Không phải để làm gì

- không phải nơi vận hành job
- không phải nơi split chapter

#### Người mới cần hiểu gì

Đây là màn “story như một sản phẩm”.

Nếu muốn hiểu story đang có những gì trước khi thao tác sâu hơn, xem ở đây trước.

### 11.3. Pipelines

#### Vào đây để làm gì

- xem job gần đây
- xem backlog
- xem alert
- xem task đang chạy quá lâu

#### Không phải để làm gì

- không phải nơi chỉnh nội dung
- không phải nơi viết prose

#### Người mới cần hiểu gì

Nếu bạn bấm một thao tác mà không thấy gì xảy ra, thường nên nhìn `Pipelines`.

### 11.4. Ingest

#### Vào đây để làm gì

- upload nguồn vào
- validate chapter
- split chapter thành scene
- approve hoặc reject split
- reprocess chapter
- set canonical source

#### Không phải để làm gì

- không phải editor cuối cùng
- không phải nơi quyết định public story

#### Người mới cần hiểu gì

`Ingest` là nơi biến tài liệu thô thành dữ liệu story có thể vận hành.

### 11.5. Write

#### Vào đây để làm gì

- viết theo scene
- đọc full chapter
- làm việc với chapter staging
- tạo chapter mới
- unlock scene
- chạy AutoWrite

#### Không phải để làm gì

- không phải nơi quản core lore
- không phải nơi quản prompt của agent

#### Người mới cần hiểu gì

`Write` là nơi làm prose và xử lý trực tiếp nội dung.

### 11.6. Analysis

#### Vào đây để làm gì

- chạy phân tích chapter
- chạy phân tích arc
- chạy phân tích saga/story
- activate snapshot
- xem task phân tích đang chạy

#### Không phải để làm gì

- không phải nơi viết prose
- không phải nơi final review của con người

#### Người mới cần hiểu gì

Trước khi viết tiếp dài, `Analysis` giúp bạn biết hệ thống đã đủ sạch để viết chưa.

### 11.7. Memory

#### Vào đây để làm gì

- xem core lore
- duyệt fact
- xem timeline
- xử lý conflict

#### Không phải để làm gì

- không phải nơi tạo beat map
- không phải nơi chạy ingest

#### Người mới cần hiểu gì

Khi story càng dài, `Memory` càng quan trọng.

### 11.8. Map

#### Vào đây để làm gì

- chỉnh scene order
- thêm/sửa beat
- gắn scene vào arc
- theo dõi thread coverage
- commit working map

#### Không phải để làm gì

- không phải nơi viết prose
- không phải nơi review scene version

#### Người mới cần hiểu gì

Nếu bạn thấy câu chuyện đang đi nhưng cấu trúc bị loãng, vào `Map`.

### 11.9. Reviews

#### Vào đây để làm gì

- xem review request
- gửi review response
- apply review response
- quyết định lock hoặc rewrite

#### Không phải để làm gì

- không phải nơi tạo analysis snapshot
- không phải nơi điều khiển worker

#### Người mới cần hiểu gì

`Reviews` là nơi quyết định của con người được ghi lại và tác động lên nội dung.

### 11.10. Settings / Unified Knowledge Hub

#### Vào đây để làm gì

- chỉnh meta core
- chỉnh tech controls
- quản dictionary technical
- quản narrative bible
- quản style guide

#### Không phải để làm gì

- không phải nơi làm scene workflow hàng ngày
- không phải nơi chạy split

#### Người mới cần hiểu gì

Đây là nơi giữ các luật, định nghĩa và cấu hình có tính hiến pháp cho story.

## 12. Hành trình thao tác chi tiết cho operator mới

### 12.1. Kịch bản A: tạo một story hoàn toàn mới

#### Bước 1: vào `Shelf`

Mục tiêu:

- xác nhận bạn đang ở story nào
- nếu chưa có story thì tạo story mới

Thao tác:

- mở `Shelf`
- bấm tạo story
- nhập `slug`
- nhập `title`
- chọn `status`

Điều cần nghĩ:

- `slug` là mã định danh ổn định
- `title` là tên hiển thị
- `status` quyết định story có đang ở giai đoạn vận hành bình thường hay chưa

Nếu làm sai ở bước này:

- slug xấu sẽ khó quản lý sau này
- title mơ hồ sẽ khiến người vận hành khác khó nhận diện story

#### Bước 2: vào `Story landing`

Mục tiêu:

- tạo lớp thông tin cơ bản cho story

Thao tác:

- chỉnh summary
- chỉnh description
- chỉnh tags
- chỉnh cautions
- upload cover nếu có

Điều cần nghĩ:

- summary là câu giới thiệu ngắn
- description là lớp giải thích dài hơn
- tags giúp phân loại
- caution là lớp cảnh báo nội dung

Nếu bỏ qua bước này:

- story vẫn chạy được về mặt kỹ thuật
- nhưng người mới vào sau sẽ khó hiểu story là gì

#### Bước 3: vào `Settings`

Mục tiêu:

- đặt nền cho hành vi viết và tri thức

Thao tác:

- kiểm tra writing language
- kiểm tra system prompt
- kiểm tra tone profile
- kiểm tra dictionary nếu đã có

Điều cần nghĩ:

- language ảnh hưởng trực tiếp tới output viết
- system prompt là chỉ dẫn tổng thể
- tone profile làm nền cho cách kể chuyện

#### Bước 4: quyết định story sẽ bắt đầu từ đâu

Có hai hướng chính:

- hướng 1: story đã có tài liệu nguồn -> đi `Ingest`
- hướng 2: story chưa có nguồn rõ ràng, muốn viết từ đầu -> có thể vào `Write`, nhưng thực tế vẫn nên dựng metadata và map sớm

### 12.2. Kịch bản B: nạp một truyện hoặc chapter đã có sẵn

#### Trường hợp 1: có nhiều file chapter riêng

Nên dùng:

- `ZIP_UPLOAD`

Lý do:

- mỗi file có thể đại diện cho một chapter
- hệ thống có thể đọc chapter number từ tên file

Những gì operator nên chuẩn bị:

- tên file có chapter number rõ
- encoding sạch
- nếu muốn manual split thì source phải có delimiter scene

#### Trường hợp 2: có một file dài chứa nhiều chapter

Nên dùng:

- `MEGA_FILE`

Lý do:

- hệ thống sẽ tìm chapter marker
- phù hợp khi nguồn được xuất thành một tài liệu dài

Operator phải chú ý:

- marker chapter phải đủ rõ
- chapter body không nên rỗng
- nếu manual split thì mỗi chapter vẫn cần delimiter scene

#### Trường hợp 3: chỉ có một đoạn text cần thử nhanh

Nên dùng:

- `PASTE_TEXT`

Phù hợp cho:

- thử nghiệm
- dựng nhanh chapter đầu
- nhập một chapter mới mà chưa muốn đóng gói file

#### Quyết định quan trọng: manual split hay auto split

Nên chọn `manual split` khi:

- bạn biết chính xác ranh giới scene
- source đã được chuẩn bị sạch
- muốn giảm tranh cãi ở bước split

Nên chọn `auto split` khi:

- chỉ có chapter prose thô
- chưa có delimiter scene
- muốn hệ thống đề xuất scene trước rồi mới duyệt

### 12.3. Kịch bản C: duyệt split draft

Sau ingest, operator thường phải quay lại `Ingest` để xem:

- chapter nào đã validate
- chapter nào đang chờ split
- chapter nào đã có split draft
- chapter nào đang bị kẹt

Operator cần nhìn những điểm sau:

- split result có đủ scene không
- scene có quá to hoặc quá nhỏ không
- cảnh báo degrade/fallback có xuất hiện không
- chapter đã có canonical source chưa

Nếu split draft tốt:

- approve split

Nếu split draft chưa tốt:

- gửi feedback
- retry
- reprocess
- hoặc quay lại source

### 12.4. Kịch bản D: viết tiếp một story đã có scene

Điểm vào:

- `Write`

Operator cần quyết định trước:

- viết ở `scene mode`
- hay làm việc ở `chapter mode`

Nên dùng `scene mode` khi:

- cần viết chi tiết
- cần review theo đơn vị nhỏ
- cần giữ history rõ

Nên dùng `chapter mode` khi:

- cần nhìn toàn chapter
- cần ghép prose cấp chapter
- cần save staging draft
- cần resplit chapter prose

### 12.5. Kịch bản E: chạy AutoWrite

Điểm vào:

- `Write`

Điều kiện ngầm nên có:

- chapter rõ
- context tương đối sạch
- lý tưởng là đã có analysis snapshot dùng được

Operator cần hiểu:

- AutoWrite không thay hoàn toàn con người
- AutoWrite tạo prose nhanh nhưng thường đi qua staging
- staging không phải scene cuối

Sau AutoWrite, operator phải quyết định:

- prose này giữ ở staging
- prose này chỉnh tay
- prose này resplit về scene

### 12.6. Kịch bản F: chuẩn bị viết chương mới một cách an toàn

Luồng nên đi:

1. `Analysis`
2. xem chapter/arc/saga snapshot
3. activate snapshot phù hợp
4. quay lại `Write`

Lý do:

- giảm nguy cơ viết sai canon
- giảm nguy cơ bỏ quên lore debt
- tạo context block tốt hơn cho guard/autowrite

### 12.7. Kịch bản G: story bắt đầu rối lore

Dấu hiệu:

- nhân vật bị mô tả không nhất quán
- timeline không khớp
- scene mới liên tục “quên” chi tiết cũ
- review lặp đi lặp lại cùng một lỗi lore

Luồng nên đi:

1. vào `Memory`
2. xem core lore
3. xem conflict review
4. approve/reject các item quan trọng
5. nếu cần thì quay lại `Write` hoặc `Map`

### 12.8. Kịch bản H: story có cấu trúc kém, nhưng prose vẫn ổn

Dấu hiệu:

- scene nào cũng viết được nhưng cảm giác chuyện đi sai hướng
- thread biến mất quá lâu
- chapter không đẩy arc rõ ràng
- beat phân bố không đều

Luồng nên đi:

1. vào `Map`
2. xem coverage
3. xem orphan scene
4. xem thread overdue
5. chỉnh beat, arc, thread
6. commit working map nếu đã ổn

### 12.9. Kịch bản I: con người cần ra quyết định cuối

Điểm vào:

- `Reviews`

Operator cần đọc:

- request nào đang mở
- response mới nhất
- score
- critical flag
- suggestion
- canon proposal

Rồi quyết định:

- `LOCK`
- hay `REWRITE`

### 12.10. Kịch bản J: cần nhìn story như người đọc

Điểm vào:

- `Story landing`
- `Read`

Mục tiêu:

- xem metadata public đã ổn chưa
- xem chapter hiển thị đã đúng chưa
- xem cảm giác trình bày đã hợp lý chưa

## 13. Mô tả chi tiết từng màn và từng panel

### 13.1. Header điều hướng toàn hệ thống

Header này thường cho phép:

- chọn story
- đổi ngôn ngữ viết
- nhảy nhanh sang các màn chính
- tạo story mới

Về nghiệp vụ, header là:

- lớp định vị xem bạn đang thao tác trên story nào
- lớp đảm bảo mọi hành động tiếp theo đều đúng story scope

Operator cần lưu ý:

- nếu chọn nhầm story, mọi thao tác sau đó sẽ đi sang context khác
- writing language đổi ở đây sẽ ảnh hưởng đến cách hệ thống tạo output

### 13.2. Story selector

Nó cho phép:

- xem story đang active
- đổi story
- tạo story mới
- vào các màn như Pipelines, Ingest, Write, Analysis, Memory, Map
- mở thêm các màn như Agents, Reviews, Feedback, Settings

Điều quan trọng:

- story selector không chỉ là navigation
- nó còn là điểm khóa story scope

### 13.3. Story landing

Trong `Story landing`, operator thường thấy:

- cover
- background
- library status
- tags
- title
- chapter list
- arc list
- nút đọc
- nút tiếp tục viết
- nút analysis
- nút memory

Về nghiệp vụ, màn này giúp trả lời:

- story này là gì
- đang ở giai đoạn nào
- có bao nhiêu chapter
- chapter thuộc arc nào
- lớp public có đủ để người khác hiểu story chưa

### 13.4. Story settings / Unified Knowledge Hub

Màn này gồm nhiều tab:

- meta
- tech
- lexicon
- narrative
- style

Ý nghĩa của từng tab:

- `meta`: lớp sự thật do con người xác nhận về title, description, summary, tags
- `tech`: lớp cấu hình hệ thống như prompt, language, llm params
- `lexicon`: từ điển technical
- `narrative`: narrative bible
- `style`: style guide

Nguyên tắc vận hành:

- cái gì mang tính hiến pháp cho story thì nên nằm ở đây
- không nên nhét các quyết định tức thời vào đây

### 13.5. Ingest header

Header của `Ingest` cho thấy:

- worker đang chạy hay không
- split lane đang chạy hay không
- LLM đang sẵn sàng hay không
- job nào đang được focus
- last updated

Nó có các hành động như:

- refresh
- start worker
- restart worker
- stop worker
- start llama
- mở pipeline view
- rebuild global profile

Về nghiệp vụ:

- đây là lớp “điều độ vận hành”
- nếu lớp này không ổn, phần split/reprocess dễ bị hiểu nhầm là lỗi nội dung trong khi thật ra là lỗi hệ thống

### 13.6. Upload source panel

Panel này là cửa nhập nguồn vào.

Nó cho phép:

- chọn upload mode
- chọn split mode
- chọn review mode
- bật hoặc tắt self healing
- bật hoặc tắt auto retry
- đặt max llm calls
- chọn validate before split
- nhập created by
- chọn zip file
- chọn mega file
- nhập pasted name
- nhập pasted chapter number
- nhập pasted text

Về nghiệp vụ:

- đây là nơi ký “hợp đồng đầu vào” cho cả pipeline ingest

### 13.7. Reprocess chapters panel

Panel này dùng khi:

- chapter cũ cần split lại
- canonical source đã thay đổi
- strategy split đã thay đổi
- chapter trước đó đi sai

Operator có thể:

- chọn chapter
- chọn reason code
- thêm reprocess note
- ép strategy
- select all
- clear selection
- run reprocess

Về nghiệp vụ:

- reprocess không phải “viết lại story”
- reprocess là chạy lại pipeline trên nguồn hoặc context mới

### 13.8. Canonical source panel

Đây là panel rất quan trọng nhưng người mới hay bỏ qua.

Nó trả lời câu hỏi:

- chapter này đang lấy nguồn nào làm mốc chính thức

Tầm quan trọng:

- nếu canonical source không đúng, analysis và các bước sau sẽ dễ hiểu sai chapter
- canonical source là một kiểu “nguồn thật” ở cấp chapter

### 13.9. Validate data panel

Panel này xuất hiện khi:

- job đang chờ data approval
- chapter ingest task đã tạo báo cáo validate

Operator dùng panel này để:

- approve data
- approve từng chapter
- reject data
- thêm rule phản hồi validate

Về nghiệp vụ:

- validate không chỉ là kiểm tra kỹ thuật
- nó là cổng kiểm tra đầu vào trước khi chapter đi sâu vào hệ thống

### 13.10. Splitter compact panel

Đây là nơi xem:

- job
- task
- split draft
- chapter scene tracker
- feedback form
- chất lượng split

Operator cần đọc panel này như đọc một “trạm kiểm định”.

Đừng coi nó là editor.

### 13.11. Write header

Header của `Write` thường cho thấy:

- chapter hiện tại
- scene hiện tại
- scene status
- chapter selector
- nút tạo chapter
- nút prose view
- nút AutoWrite
- nút unlock nếu scene bị lock

Về nghiệp vụ:

- đây là điểm quyết định xem bạn đang thao tác theo chapter hay theo scene

### 13.12. Draft runner

Đây là lõi của scene mode.

Nó chịu trách nhiệm cho:

- editor scene
- assist
- ghost suggestion
- commit
- report
- control

Về nghiệp vụ:

- Draft runner là nơi sinh và chỉnh `scene version`

### 13.13. Chapter reader

Đây là lõi của chapter mode.

Nó cho phép:

- đọc toàn bộ chapter
- xem pending prose
- xem staging prose
- save prose
- resplit prose

Về nghiệp vụ:

- chapter mode không làm mất scene mode
- nó là lớp làm việc song song ở cấp chapter

### 13.14. AutoWrite wizard

Wizard này là điểm vào cho chapter-level automation.

Operator cần hiểu:

- nó không phải nút “xong hết”
- nó là nút “bắt đầu một workflow tự động”

Sau wizard, phần quan trọng vẫn là:

- xem output
- quyết định giữ, sửa hay resplit

### 13.15. Analysis workspace

Workspace này có thể hoạt động theo scope:

- chapter
- arc
- story
- chapter_range

Nó cho phép:

- tạo analysis run
- xem running task
- activate snapshot
- xem active snapshot
- xem status như `ready_for_writing`, `degraded_mode`, `fact_status`

Về nghiệp vụ:

- analysis workspace là nơi trả lời “viết tiếp bây giờ có an toàn không”

### 13.16. Memory hub

Memory hub có các tab:

- chapter
- arc
- saga
- core
- conflicts

Ý nghĩa:

- `chapter`: nối sang historian analysis
- `arc`: xem arc memory
- `saga`: xem saga/canon memory
- `core`: duyệt core DB
- `conflicts`: xử lý entity conflict

### 13.17. Core DB console

Core DB console có các mode:

- analyze
- review
- approve

Nó cho phép:

- filter theo status
- filter theo source kind
- filter theo entity type
- filter theo classification
- filter theo chapter
- search
- chọn nhiều item
- approve
- reject
- reset to pending

Về nghiệp vụ:

- đây là lớp “vét cạn và hợp nhất” các fact quan trọng nhất

### 13.18. Conflict console

Đây là nơi operator nhìn mâu thuẫn về:

- entity
- value
- evidence
- authority score
- suggested resolution

Nó không chỉ báo lỗi.

Nó buộc operator ra quyết định:

- giữ cái nào
- bỏ cái nào
- overlay cái nào

### 13.19. Map page

Map page cho phép:

- xem chapter và scene theo cấu trúc map
- filter theo act
- filter theo arc
- filter theo thread type
- filter theo thread
- chỉ xem orphan scene
- mở scene detail drawer
- xem metrics
- import/export map
- commit/restore map version

Về nghiệp vụ:

- map là bảng điều phối cấu trúc
- nó giúp phát hiện vấn đề mà prose đẹp nhưng cấu trúc yếu vẫn không lộ ra

### 13.20. Scene detail drawer trong Map

Drawer này thường cho phép:

- xem scene meta
- xem beat
- xem arc
- xem thread
- thêm beat
- sửa beat
- xoá beat
- reorder beat

Operator cần hiểu:

- sửa ở đây là sửa cấu trúc của scene trong story map
- không phải sửa prose

### 13.21. Review panel

Review panel có ba vùng nhìn chính:

- danh sách request
- form submit response
- danh sách response

Nó cho phép:

- filter request theo status
- refresh
- chọn request
- submit response
- apply latest response

Về nghiệp vụ:

- review panel là nơi phản hồi của con người được chính thức hoá

### 13.22. Pipeline overview

Pipeline overview cho thấy:

- total jobs
- running jobs
- failed jobs
- wait review jobs
- done jobs
- ready backlog
- running tasks
- active alerts
- alert feed
- recent jobs

Nó phục vụ:

- theo dõi vận hành
- phát hiện bottleneck
- biết khi nào lỗi là do pipeline, không phải do nội dung

## 14. Trạng thái dữ liệu và state machine mà operator phải hiểu

### 14.1. Trạng thái của story

Story thường có các trạng thái như:

- `ACTIVE`
- `DRAFT`
- `ARCHIVED`

Ý nghĩa vận hành:

- `ACTIVE`: story đang được dùng bình thường
- `DRAFT`: story đang ở giai đoạn dựng hoặc setup kín
- `ARCHIVED`: story không còn là story vận hành bình thường

Điều quan trọng:

- `status` của story không giống `library_status`

### 14.2. Trạng thái public của story

Ở lớp library/public, story thường có:

- `draft`
- `private`
- `published`
- `archived`

Ý nghĩa:

- `draft`: story còn đang chuẩn bị
- `private`: story có dữ liệu nhưng chưa muốn lộ ra ngoài
- `published`: story đã đủ để hiển thị trên shelf/reader
- `archived`: story không còn muốn hiển thị như đối tượng sống

### 14.3. Trạng thái scene

Scene có thể đi qua các trạng thái như:

- `DRAFTING`
- `DRAFTED`
- `EVALUATED`
- `REVISED`
- `LOCKED`

Nghĩa vận hành:

- `DRAFTING`: scene đang trong quá trình tạo hoặc chuẩn bị
- `DRAFTED`: đã có bản draft
- `EVALUATED`: đã có lớp đánh giá
- `REVISED`: đã qua một vòng rewrite
- `LOCKED`: không cho ghi đè bình thường nữa

Người mới cần nhớ:

- `LOCKED` là trạng thái rất quan trọng
- nếu cần sửa lại, thường phải unlock trước

### 14.4. Trạng thái chapter ở lớp staging

Chapter staging thường mang ý nghĩa:

- chapter đang có prose tạm
- chapter đang ở trạng thái chưa trở thành tập scene chính thức
- chapter có thể đang chờ save, chờ resplit hoặc chờ xác minh

Điều dễ nhầm:

- chapter staging không có nghĩa chapter đã xong
- chapter staging cũng không có nghĩa chapter đã public

### 14.5. Trạng thái review

Review request thường có:

- `OPEN`
- `SUBMITTED`
- `APPLIED`

Nghĩa vận hành:

- `OPEN`: đã có request nhưng chưa có response hợp lệ
- `SUBMITTED`: đã có response
- `APPLIED`: một response đã được chọn và áp dụng

Điểm cần nhớ:

- `SUBMITTED` chưa có nghĩa quyết định đã được chấp nhận
- chỉ khi `APPLIED` thì request mới thật sự tạo tác động nghiệp vụ

### 14.6. Trạng thái memory vetting

Memory item thường có:

- `PENDING`
- `APPROVED`
- `REJECTED`

Nghĩa vận hành:

- `PENDING`: mới trích xuất, chưa nên xem là tri thức ổn định
- `APPROVED`: đã được con người duyệt
- `REJECTED`: không nên dùng tiếp như tri thức có hiệu lực

### 14.7. Trạng thái ingest job

Ingest job thường có:

- `RUNNING`
- `AWAIT_APPROVAL`
- `DONE`
- `FAILED`

Trong thực tế còn có các trạng thái trung gian theo mode hoặc theo panel.

Người vận hành cần nhìn job như:

- container của một đợt xử lý
- không phải chính chapter
- không phải chính scene

### 14.8. Trạng thái ingest task

Task thường có:

- `READY`
- `RUNNING`
- `DONE`
- `FAILED`
- hoặc các trạng thái chờ review/approval trong một số luồng

Nghĩa vận hành:

- `READY`: đã vào hàng chờ, chưa chạy
- `RUNNING`: đang được worker xử lý
- `DONE`: đã có kết quả
- `FAILED`: không thành công

### 14.9. Trạng thái analysis snapshot

Snapshot phân tích có thể mang các cờ như:

- `fact_status`
- `ready_for_writing`
- `degraded_mode`
- `approval_status`
- `is_stale`

Đây là các câu hỏi nghiệp vụ:

- dữ kiện có sạch không
- có nên dùng snapshot này để viết tiếp không
- snapshot này có đang bị degrade không
- snapshot này có cũ quá không

### 14.10. Active snapshot nghĩa là gì

Một story có thể có nhiều snapshot.

Nhưng tại một thời điểm, operator thường cần biết:

- snapshot nào đang là snapshot được chọn làm ngữ cảnh chính thức

Đó là vai trò của active snapshot.

### 14.11. Map working version và active version

Map có hai ý niệm rất quan trọng:

- `working_version`
- `active_version`

Nghĩa:

- `working_version`: bản cấu trúc đang chỉnh
- `active_version`: bản cấu trúc đang dùng thật

Điều này cho phép:

- thử chỉnh map mà không phá ngay cấu trúc đang dùng

### 14.12. Source ổn định nghĩa là gì

Nguồn chapter có thể được đánh dấu ổn định.

Ý nghĩa:

- chapter này đã có mốc nguồn đủ tin cậy
- các bước split, analysis, reprocess có thể bám vào cùng một gốc rõ ràng hơn

Nếu không có nguồn ổn định:

- analysis và split có thể bị lệch
- operator khó biết “đang bám theo bản nào”

## 15. Input contract chi tiết

### 15.1. `ZIP_UPLOAD`

Đây là mode phù hợp nhất khi:

- bạn có nhiều chapter tách file
- mỗi chapter đã có cấu trúc tương đối rõ

Lợi ích:

- chapter number dễ suy ra từ tên file
- dễ reprocess từng chapter
- dễ đối chiếu lại nguồn gốc

Rủi ro:

- tên file tệ sẽ làm chapter number mơ hồ
- encoding lỗi sẽ làm validate fail

### 15.2. `MEGA_FILE`

Đây là mode phù hợp khi:

- bạn có một file lớn duy nhất
- nội dung có chapter marker rõ ràng

Lợi ích:

- ít phải chuẩn bị file
- nhanh để nạp một khối nội dung lớn

Rủi ro:

- thiếu chapter marker sẽ làm hệ thống khó tách
- chapter rỗng hoặc marker sai làm validate fail

### 15.3. `PASTE_TEXT`

Phù hợp cho:

- nhập nhanh
- test nhanh
- thử chapter đầu
- làm việc kiểu thủ công

Rủi ro:

- dễ bỏ quên metadata chapter
- dễ thiếu naming convention
- dễ khó audit hơn nếu dùng như con đường chính lâu dài

### 15.4. Scene delimiter

Scene delimiter quan trọng với manual split.

Nếu source không có delimiter rõ:

- hệ thống sẽ không hiểu đâu là ranh giới scene do con người chủ định

Điều này dẫn đến:

- manual split kém hiệu lực
- tăng tranh cãi ở bước approve split

### 15.5. Chapter marker

Chapter marker quan trọng với mega file và paste text nhiều chapter.

Nếu chapter marker yếu:

- normalized chapter sẽ không ổn
- thứ tự chapter có thể sai
- chapter count sẽ không đáng tin

### 15.6. Created by

`created_by` có vẻ chỉ là metadata nhỏ, nhưng về vận hành nó quan trọng vì:

- biết ai đã tạo ingest job
- hỗ trợ audit
- hỗ trợ phân biệt job hệ thống và job người dùng

### 15.7. Review mode

Review mode ở ingest phản ánh:

- chapter hoặc task sẽ đi qua lớp duyệt như thế nào

Người mới không cần tinh chỉnh quá sớm, nhưng cần biết:

- ingest không chỉ là upload file
- nó còn gắn với cách chapter sẽ được kiểm duyệt trước khi đi sâu hơn

### 15.8. Self healing

Đây là một cờ điều khiển hành vi pipeline.

Hiểu ở góc nghiệp vụ:

- nếu bật, hệ thống sẽ cố tự sửa một số trục trặc mềm trong quá trình chạy

### 15.9. Auto retry

Đây là cờ cho biết:

- task lỗi có được thử lại không

Về nghiệp vụ:

- nó giúp giảm thao tác tay khi lỗi chỉ là nhiễu tạm thời

### 15.10. Max LLM calls

Đây là rào giới cho mức nỗ lực của pipeline tự động.

Về nghiệp vụ:

- càng cao thì hệ thống càng cố gắng hơn
- nhưng cũng có thể tốn thời gian hơn

### 15.11. Validate before split

Đây là câu hỏi:

- có muốn kiểm tra đầu vào kỹ hơn trước khi chính thức split không

Nên bật khi:

- nguồn phức tạp
- chapter dài
- chất lượng nguồn không đồng đều

## 16. Output, artifact và cách diễn giải

### 16.1. `source_doc`

Đây là artifact nền.

Nó là:

- bản nguồn được lưu lại
- mốc để đối chiếu
- lớp `source of truth` đầu tiên

Không nên nhầm nó với:

- scene
- chapter staging
- public chapter

### 16.2. `split_draft`

Đây là:

- đề xuất tách scene
- chưa phải scene chính thức

Operator phải xem nó như:

- bản nháp cấu trúc
- chứ chưa phải dữ liệu đã duyệt

### 16.3. `scene version`

Đây là hạt lịch sử quan trọng nhất của lớp viết.

Mỗi scene version cho biết:

- content là gì
- version number là gì
- nó là draft hay rewrite
- evaluation của nó ra sao

### 16.4. `chapter staging`

Đây là:

- vùng tạm cấp chapter
- nơi prose được giữ trước khi chốt về hướng scene hoặc tiếp tục sửa

Operator phải luôn tự hỏi:

- đây đã là bản làm việc cuối chưa

Thông thường câu trả lời là:

- chưa

### 16.5. `analysis snapshot`

Snapshot là:

- ảnh chụp phân tích
- không phải chân lý vĩnh viễn

Snapshot tốt giúp:

- viết an toàn hơn
- autowrite tốt hơn
- guard có context tốt hơn

### 16.6. `active analysis snapshot`

Đây là snapshot đã được chọn.

Khác biệt quan trọng:

- không phải snapshot nào tồn tại cũng đang được dùng

### 16.7. `canon_fact`

Đây là fact mới trích từ scene/version.

Nó hữu ích, nhưng chưa chắc đã đáng tin lâu dài.

Vì vậy cần có:

- vetting
- conflict review
- hoặc nâng cấp lên story canon fact

### 16.8. `story_canon_fact`

Đây là fact đã được kéo lên cấp story.

Nó giống một lớp tri thức bền hơn.

Tuy nhiên:

- vẫn cần dùng thận trọng
- vẫn nên hiểu nguồn gốc của nó

### 16.9. `review_response`

Đây là phản hồi của người kiểm duyệt.

Nó có giá trị nghiệp vụ lớn, nhưng:

- nếu chưa apply thì chưa phải quyết định cuối

### 16.10. `review_apply_log`

Đây là:

- nhật ký quyết định
- bằng chứng audit

Nó rất quan trọng khi:

- cần truy xem ai đã chọn lock
- cần truy xem khi nào canon proposal được áp dụng

### 16.11. `working map version`

Đây là bản map đang chỉnh.

Đừng nhầm nó với:

- active map
- hay cấu trúc đang dùng chính thức

### 16.12. `reader payload`

Đây là lớp output dành cho trải nghiệm đọc.

Nó không nên bị trộn với:

- source doc
- chapter staging
- split draft

## 17. Database nghiệp vụ theo câu hỏi thực tế

### 17.1. Nếu muốn biết story là gì, nhìn ở đâu

Nhìn vào:

- `story_series`
- `story_chapter`
- asset và metadata liên quan

Bạn sẽ tìm thấy:

- slug
- title
- status
- summary
- description
- library status
- image path

### 17.2. Nếu muốn biết chapter đang có dữ liệu kiểu gì

Bạn phải nhìn nhiều lớp:

- `source_doc` để biết nguồn gốc
- `narrative_chapter_staging` để biết prose tạm
- `narrative_scene` để biết chapter đã có scene chưa
- `story_chapter` để biết chapter title/arc metadata

### 17.3. Nếu muốn biết scene đang ở trạng thái nào

Nhìn:

- `narrative_scene`

Nếu muốn biết history của scene:

- nhìn `narrative_scene_version`

### 17.4. Nếu muốn biết một thao tác đang chạy hay bị kẹt

Nhìn:

- `ingest_job`
- `ingest_task`
- `pipeline_node_event`

### 17.5. Nếu muốn biết vì sao hệ thống cho hoặc không cho viết tiếp

Nhìn:

- `writing_snapshot_v3`
- `writing_scope_snapshot_v1`
- active snapshot tables

Vì ở đó có:

- `fact_status`
- `ready_for_writing`
- `degraded_mode`
- `narrative_score`

### 17.6. Nếu muốn biết story “nhớ” gì

Nhìn:

- `canon_fact`
- `timeline_anchor`
- `story_canon_fact`
- `core_memory_vetting_state`

### 17.7. Nếu muốn biết lore nào đang mâu thuẫn

Nhìn:

- `entity_conflict_review`

### 17.8. Nếu muốn biết cấu trúc câu chuyện đang được map ra sao

Nhìn:

- `story_map_state`
- `story_map_version`
- `story_scene_map`
- `story_beat`
- `story_arc`
- `story_thread`

### 17.9. Nếu muốn biết review con người đã đi đến đâu

Nhìn:

- `review_request`
- `review_response`
- `review_apply_log`

### 17.10. Nếu muốn biết story có luật và hiến pháp riêng gì

Nhìn:

- `story_worldbuilding_note`
- `story_style_profile`
- `story_dictionary`

### 17.11. Hệ thống này thực ra đang dùng mấy loại database khác nhau

Nếu nhìn theo góc độ vận hành, Studio có thể liên quan tới bốn lớp lưu trữ hoặc truy xuất khác nhau:

- `PostgreSQL`
- `Qdrant`
- `Neo4j`
- `MCP bridge`

Nhưng cần hiểu thật rõ:

- chỉ `PostgreSQL` là nơi giữ phần lớn dữ liệu nghiệp vụ gốc của Studio
- `Qdrant` và `Neo4j` là lớp hỗ trợ truy xuất nâng cao
- `MCP bridge` không phải database
- `MCP bridge` là cầu nối để Studio hỏi dữ liệu từ lớp ngoài

Nói ngắn gọn:

- muốn biết story thật đang ở đâu, nhìn vào `PostgreSQL`
- muốn biết hệ thống có đang dùng truy xuất ngữ nghĩa hoặc quan hệ đồ thị hay không, nhìn `Qdrant`, `Neo4j` và cờ bật `MCP`
- muốn biết khi lớp ngoài tắt thì hệ thống còn chạy được không, câu trả lời là vẫn chạy được theo chế độ fallback về `PostgreSQL`

### 17.12. `PostgreSQL` giữ vai trò gì trong Studio

`PostgreSQL` là database nghiệp vụ chính.

Đây là nơi giữ:

- story master
- chapter master
- scene và scene version
- chapter staging
- ingest job và ingest task
- analysis snapshot
- memory, canon, timeline
- map, beat, arc, thread
- review request, response, apply log
- dictionary, style profile, worldbuilding note

Nếu cần trả lời các câu hỏi sau, gần như luôn phải nhìn vào `PostgreSQL` trước:

- story này tồn tại chưa
- chapter này đang ở trạng thái nào
- scene nào là bản đang dùng
- staging có gì
- review đã apply chưa
- memory nào đã được approve
- map version nào đang active

Lý do phải để các lớp này ở `PostgreSQL`:

- đây là lớp giao dịch chính của hệ thống
- cần tính nhất quán khi operator thao tác
- cần audit được lịch sử thay đổi
- cần liên kết chặt giữa story, chapter, scene, review và analysis
- cần làm nguồn thật khi các lớp hỗ trợ khác không sẵn sàng

Về mặt nghiệp vụ, hãy xem `PostgreSQL` là:

- sổ cái chính
- nguồn thật
- nơi quyết định trạng thái vận hành hiện tại

Không nên xem `Qdrant`, `Neo4j` hay `MCP` là nơi thay thế cho vai trò này.

### 17.13. `Qdrant` giữ vai trò gì

`Qdrant` là lớp truy xuất ngữ nghĩa.

Nó phù hợp cho các câu hỏi kiểu:

- trong đống lore dài này, đoạn nào có nghĩa gần với cảnh đang viết
- có chi tiết worldbuilding nào liên quan mà operator không gõ đúng từ khóa nhưng nghĩa vẫn gần
- có memory hay note nào nên được kéo vào context vì giống về ý chứ không giống nguyên chữ

Nói theo cách dễ hiểu:

- `PostgreSQL` giỏi giữ sự thật có cấu trúc
- `Qdrant` giỏi tìm thứ "na ná về nghĩa"

Trong Studio, lớp này hữu ích nhất khi:

- build context cho write
- enrich analysis
- kéo world-tagged lines hoặc semantic hints
- giảm việc bỏ sót lore chỉ vì khác từ vựng

Nhưng `Qdrant` không nên bị hiểu nhầm là:

- nơi lưu canon chính thức
- nơi quyết định approve hay reject
- nơi thay thế review của con người

Nếu `Qdrant` tắt:

- hệ thống vẫn có thể chạy
- context sẽ nghèo hơn ở lớp semantic retrieval
- một số gợi ý liên quan theo nghĩa có thể không xuất hiện
- Studio sẽ dựa nhiều hơn vào dữ liệu truy trực tiếp từ `PostgreSQL`

Vì vậy, về nghiệp vụ:

- `Qdrant` là kho hỗ trợ tìm đúng thứ liên quan
- không phải kho quyết định đúng sai cuối cùng

### 17.14. `Neo4j` giữ vai trò gì

`Neo4j` là lớp đồ thị quan hệ.

Nó phù hợp cho các câu hỏi kiểu:

- nhân vật này đang liên hệ với ai
- chuỗi quan hệ nào dễ gây xung đột continuity
- một thực thể mới chạm vào những node nào trong mạng quan hệ hiện có
- nếu sửa một điểm trong lore thì các cạnh quan hệ nào có thể bị ảnh hưởng

Nói đơn giản:

- `PostgreSQL` giữ record theo bảng
- `Neo4j` mạnh ở việc đi theo đường nối giữa các thực thể

Trong Studio, lớp này đặc biệt có ích khi:

- cần neighborhood của cast hoặc entity
- cần relationship lines giàu ngữ cảnh hơn
- cần nhìn nhanh lineage hoặc impact chain
- cần hỗ trợ guard khi một cảnh chạm vào nhiều nhân vật hay phe phái

Nhưng `Neo4j` cũng không phải:

- nơi lưu chapter staging gốc
- nơi lưu review request chính thức
- nơi có thẩm quyền cuối cùng hơn `PostgreSQL`

Nếu `Neo4j` tắt:

- hệ thống vẫn chạy
- relationship context sẽ quay về mức cơ bản hơn
- nhiều quan hệ vẫn có thể được dựng từ dữ liệu `PostgreSQL`
- nhưng chiều sâu theo đồ thị sẽ giảm

Về nghiệp vụ, hãy xem `Neo4j` là:

- kho phụ để đọc mạng quan hệ
- lớp tăng chiều sâu cho context
- không phải nguồn thật duy nhất

### 17.15. Vì sao `Qdrant` và `Neo4j` không nhập thẳng vào một database chung

Lý do không phải vì hệ thống "thích phức tạp", mà vì mỗi loại dữ liệu có một kiểu truy vấn khác nhau.

`PostgreSQL` phù hợp với:

- record có schema rõ
- quan hệ giao dịch chuẩn
- cập nhật trạng thái
- join theo khóa
- audit và apply quyết định

`Qdrant` phù hợp với:

- truy xuất gần nghĩa
- top-k semantic match
- tìm thứ liên quan mà không cần trùng từ khóa

`Neo4j` phù hợp với:

- truy theo cạnh quan hệ
- neighborhood nhiều hop
- impact chain
- lineage và network reasoning

Nếu ép tất cả vào cùng một chỗ:

- dữ liệu giao dịch sẽ khó giữ sạch
- truy vấn semantic và graph sẽ kém hiệu quả
- lớp write và guard sẽ khó lấy đúng loại context mà nó cần

Vì vậy, cách hiểu đúng cho operator là:

- `PostgreSQL` để vận hành hằng ngày
- `Qdrant` để tìm cái liên quan theo nghĩa
- `Neo4j` để nhìn mạng quan hệ

### 17.16. `MCP` trong Studio là gì

Trong dự án này, `MCP` nên được hiểu là lớp cầu nối giữa Studio và các dịch vụ truy xuất ngoài.

Nó không phải:

- story database chính
- review database
- nơi operator vào để sửa trực tiếp prose

Vai trò của `MCP` là:

- nhận yêu cầu context từ Studio
- gọi sang lớp ngoài như `Qdrant` hoặc `Neo4j`
- trả kết quả đã chuẩn hóa về cho pipeline đang cần

Nói theo ngôn ngữ vận hành:

- Studio không nhất thiết nói chuyện trực tiếp với mọi kho ngoài
- thay vào đó, Studio đi qua một "cầu nối historian"
- cầu nối này giúp chuẩn hóa cách lấy graph context và semantic context

Điều này quan trọng vì:

- một pipeline viết không cần biết chi tiết bên dưới dùng graph hay vector
- operator không phải học cách truy vấn từng hệ ngoài
- hệ thống có thể bật, tắt hoặc fallback theo cờ cấu hình

### 17.17. `MCP` đang xuất hiện ở đâu trong luồng nghiệp vụ

`MCP` không phải là màn operator thao tác mỗi ngày.

Operator thường chạm vào kết quả của `MCP` một cách gián tiếp, ví dụ:

- guard context giàu hơn
- relationship lines nhiều hơn
- worldbuilding hints sát nghĩa hơn
- analysis thấy thêm external signals
- AutoWrite có context dày hơn trước khi sinh prose

Tức là:

- operator dùng `Write`, `Analysis`, `Memory`
- còn `MCP` đứng phía sau để làm context tốt hơn

Nếu không biết `MCP`, operator vẫn có thể dùng Studio.

Nhưng nếu hiểu `MCP`, operator sẽ giải thích được vì sao:

- hôm nay context dày hơn hôm qua
- có lúc relationship lines sâu hơn hẳn
- có lúc semantic hint biến mất khi external retrieval bị tắt

### 17.18. Khi nào hệ thống gọi `MCP`, khi nào không gọi

Hệ thống chỉ gọi lớp ngoài khi các cờ external retrieval được bật.

Nếu lớp này đang tắt hoặc thiếu cấu hình:

- Studio không dừng hẳn
- hệ thống rơi về chế độ `fallback_postgres`
- context vẫn được dựng từ dữ liệu đang có trong `PostgreSQL`

Điểm này rất quan trọng cho onboarding:

- bật `MCP` không phải điều kiện bắt buộc để dùng Studio
- `MCP` là lớp tăng chất lượng context
- không phải điều kiện tồn tại của luồng vận hành chính

Vì vậy, khi operator thấy output "ít thông minh hơn" ở lớp context:

- chưa chắc là lỗi story
- chưa chắc là lỗi write model
- có thể đơn giản là external retrieval đang tắt hoặc bị timeout

### 17.19. Cách phân biệt lỗi `PostgreSQL`, lỗi `MCP`, lỗi `Qdrant`, lỗi `Neo4j`

Nếu lỗi nằm ở `PostgreSQL`, thường biểu hiện là:

- story không load được
- chapter không ra dữ liệu
- scene không thấy version
- review request biến mất
- map state không đọc được

Nếu lỗi nằm ở `MCP`, thường biểu hiện là:

- external retrieval warning tăng
- context có nhưng bị mỏng hơn bình thường
- hệ thống báo đang fallback
- một phần external signal không xuất hiện

Nếu lỗi nằm ở `Qdrant`, thường biểu hiện là:

- semantic hint mất
- world-tagged retrieval nghèo đi
- những thứ liên quan theo nghĩa không còn được gợi ra rõ

Nếu lỗi nằm ở `Neo4j`, thường biểu hiện là:

- relationship lines ngắn hơn
- neighborhood của cast nghèo hơn
- lineage conflict hoặc impact chain ít chiều sâu hơn

Trong cả ba trường hợp `MCP`, `Qdrant`, `Neo4j`:

- đừng vội kết luận là prose sai
- đừng vội cho rằng operator nhập sai input
- hãy kiểm tra xem hệ thống đang ở chế độ external đầy đủ, partial hay fallback

### 17.20. Câu trả lời ngắn gọn nhất để người mới nhớ

Nếu chỉ cần nhớ một phiên bản rất ngắn:

- `PostgreSQL` là nơi giữ dữ liệu nghiệp vụ chính
- `Qdrant` là nơi giúp tìm dữ liệu gần nghĩa
- `Neo4j` là nơi giúp nhìn dữ liệu theo mạng quan hệ
- `MCP` là cầu nối để Studio lấy dữ liệu từ các lớp ngoài
- khi lớp ngoài không sẵn sàng, Studio vẫn còn `PostgreSQL` để tiếp tục chạy

## 18. Checklist vận hành theo từng giai đoạn

### 18.1. Checklist khi tạo story mới

- đã có `slug` rõ ràng chưa
- `title` có rõ nghĩa chưa
- story đang để `ACTIVE`, `DRAFT` hay `ARCHIVED`
- summary đã đủ để người khác hiểu story là gì chưa
- description đã đủ để onboarding người mới chưa
- tags đã phản ánh đúng thể loại chưa
- cautions đã khai báo đủ chưa
- writing language đã đúng chưa
- system prompt có đang để rỗng ngoài ý muốn không
- tone profile có đang quá chung chung không

### 18.2. Checklist trước khi ingest

- bạn có đang ở đúng story không
- nguồn vào là zip, mega file hay paste text
- chapter marker có rõ chưa
- encoding có sạch chưa
- nếu manual split thì delimiter scene đã rõ chưa
- created by đã có chưa
- split mode đã chọn đúng chưa
- validate before split có nên bật không
- canonical source strategy đã nghĩ tới chưa

### 18.3. Checklist khi duyệt split

- chapter có đúng thứ tự không
- scene count có hợp lý không
- scene nào quá dài không
- scene nào quá ngắn không
- quality signal có warning gì không
- có degrade path nào đã bị kích hoạt không
- canonical source đã đúng chưa
- feedback trước đó đã được phản ánh chưa
- chapter này có nên approve ngay không

### 18.4. Checklist trước khi viết scene

- scene đang ở chapter nào
- scene status hiện tại là gì
- scene đã từng bị review chưa
- scene hiện có version nào là current
- active analysis snapshot đã có chưa
- guard context có đủ sạch chưa
- worldbuilding và dictionary đã đủ chưa

### 18.5. Checklist trước khi dùng chapter mode

- chapter này đã có scene chưa
- chapter staging hiện đang có gì
- pending prose có phải output AutoWrite mới nhất không
- chapter mode đang để xem hay đang để chỉnh
- chapter này nên tiếp tục staging hay nên resplit

### 18.6. Checklist trước khi chạy AutoWrite

- chapter đã chọn đúng chưa
- context đang dùng có đủ sạch chưa
- chapter này có cần viết tay thay vì tự động không
- target word count có hợp lý không
- plan có cần được duyệt bởi người trước khi chạy sâu hơn không
- chapter đang có staging cũ không
- staging cũ có cần xóa logic cũ hay giữ để so sánh không

### 18.7. Checklist trước khi activate analysis snapshot

- scope đang đúng chưa
- snapshot có stale không
- `fact_status` là gì
- `ready_for_writing` có bật không
- `degraded_mode` có bật không
- narrative score có thấp bất thường không
- open loops có quá nhiều không
- snapshot này có thực sự tốt hơn snapshot hiện tại không

### 18.8. Checklist khi duyệt memory

- item đang là `PENDING`, `APPROVED` hay `REJECTED`
- item này là `CANON_FACT`, `TIMELINE_ANCHOR` hay `STORY_CANON_FACT`
- evidence có đủ không
- duplicate count có cao không
- item này có nên trở thành tri thức ổn định không
- note review có cần ghi lại không

### 18.9. Checklist khi xử lý conflict

- conflict nằm ở entity nào
- candidate value nào có authority score cao hơn
- chapter nào là nguồn gốc của conflict
- conflict này có ảnh hưởng write ngay bây giờ không
- nên resolve bằng overlay hay bằng sửa nội dung gốc

### 18.10. Checklist khi chỉnh map

- chapter đang được xem có đúng không
- scene nào đang orphan
- act filter có đang làm bạn bỏ sót scene không
- arc của scene có đúng không
- beat có phản ánh thật sự chuyện xảy ra trong scene không
- thread nào đã bị rơi khỏi nhiều scene
- bạn đang sửa working version hay active version

### 18.11. Checklist khi apply review

- đã chọn đúng request chưa
- response mới nhất có thực sự là response tốt nhất không
- critical flag có đang xuất hiện không
- human score có quá thấp không
- canon proposal nào đáng đưa vào story canon
- decision nên là `LOCK` hay `REWRITE`

### 18.12. Checklist trước khi public một story

- library status đã đúng chưa
- cover đã có chưa
- summary đã đủ rõ chưa
- tags có phản ánh đúng nội dung chưa
- cautions có đủ chưa
- chapter title đã ổn chưa
- chapter nào nên xuất hiện ra reader
- còn staging hoặc draft nào đang khiến người xem hiểu nhầm không

## 19. Lỗi thường gặp và cách hiểu đúng

### 19.1. “Tôi đã upload rồi mà không thấy chapter xuất hiện”

Cách hiểu đúng:

- upload không đồng nghĩa chapter đã trở thành scene
- chapter có thể mới dừng ở `source_doc`
- hoặc đang nằm trong `ingest_job`
- hoặc đang chờ validate

Điểm cần kiểm tra:

- `Pipelines`
- `Ingest`
- worker status

### 19.2. “Tôi thấy chapter trong Write nhưng sao lại không phải scene”

Cách hiểu đúng:

- `Write` có cả scene mode và chapter mode
- chapter mode có thể đang hiển thị `chapter staging` hoặc `full chapter read`

Điểm cần kiểm tra:

- bạn đang ở `viewMode = scene` hay `viewMode = chapter`
- chapter đó có scene thật chưa

### 19.3. “Scene đã viết rồi, sao vẫn bị sai lore”

Cách hiểu đúng:

- viết xong không có nghĩa lore đã sạch
- có thể analysis chưa được chạy lại
- memory chưa được vet
- conflict chưa được resolve
- guard context chưa đủ

### 19.4. “Analysis xong rồi, sao vẫn chưa phải quyết định cuối”

Cách hiểu đúng:

- analysis là góc nhìn của hệ thống
- nó không thay quyết định review của con người

### 19.5. “Review submitted rồi, sao scene chưa lock”

Cách hiểu đúng:

- `SUBMITTED` chưa có nghĩa là `APPLIED`
- operator vẫn phải chọn response để apply

### 19.6. “Map nhìn đẹp rồi, sao prose vẫn dở”

Cách hiểu đúng:

- map giải bài toán cấu trúc
- prose giải bài toán diễn đạt

Map tốt không đảm bảo prose tốt.

### 19.7. “Tôi đã có chapter staging, sao reader chưa thấy”

Cách hiểu đúng:

- chapter staging là lớp tạm
- reader chỉ nên nhìn lớp public/đọc được

### 19.8. “Tôi có canon fact rồi, sao memory vẫn chưa ổn”

Cách hiểu đúng:

- canon fact mới là lớp trích xuất ban đầu
- nó có thể còn pending hoặc mâu thuẫn

### 19.9. “Tôi sửa map mà sao scene prose không đổi”

Cách hiểu đúng:

- map không tự sửa prose
- map chỉ sửa cấu trúc và lớp tổ chức

### 19.10. “Tôi thấy nhiều snapshot, biết chọn cái nào”

Cách hiểu đúng:

- không phải snapshot nào mới nhất cũng là snapshot tốt nhất
- hãy nhìn:
  - `fact_status`
  - `ready_for_writing`
  - `degraded_mode`
  - `is_stale`
  - scope phù hợp hay không

## 20. Các nguyên tắc vận hành để không làm bẩn dữ liệu

### 20.1. Không nhầm lớp source với lớp write

- source doc là nguồn gốc
- scene version là sản phẩm viết
- chapter staging là vùng tạm

Ba lớp này không nên bị đối xử như một.

### 20.2. Không nhầm lớp analysis với lớp review

- analysis để hiểu tình hình
- review để ra quyết định

### 20.3. Không nhầm lớp cấu trúc với lớp prose

- beat, arc, thread không phải prose
- map tốt chưa chắc prose tốt
- prose tốt chưa chắc map tốt

### 20.4. Không đẩy fact cục bộ thành fact cấp story quá sớm

Vì:

- fact cục bộ có thể vẫn sai
- context về sau có thể bác bỏ nó

### 20.5. Không dùng staging như lớp public

Vì:

- staging là vùng tạm
- chưa chắc đã sạch
- chưa chắc đã duyệt

### 20.6. Không xem pipeline alert như lỗi nội dung ngay lập tức

Vì:

- có alert do worker
- có alert do queue
- có alert do timeout
- có alert do retry limit

### 20.7. Không chỉnh prompt agent để sửa lỗi nội dung thông thường

Vì:

- nhiều lỗi nội dung thật ra nằm ở source
- hoặc ở split
- hoặc ở analysis
- hoặc ở review chưa apply

## 21. Câu hỏi operator nên tự hỏi trước mỗi hành động lớn

### 21.1. Trước khi ingest

- tôi đang ingest vào đúng story chưa
- chapter nguồn này có phải bản mới nhất không
- tôi đang chọn split mode đúng chưa

### 21.2. Trước khi approve split

- split này có thực sự phản ánh chapter không
- canonical source đã đúng chưa
- có cần feedback để hệ thống học tốt hơn không

### 21.3. Trước khi commit scene

- scene này đã đủ tốt chưa
- scene này có mâu thuẫn với lore đang active không
- scene này có cần review trước không

### 21.4. Trước khi chạy AutoWrite

- chapter này có đủ context không
- chapter này có nên viết tay thay vì tự động không
- tôi có sẵn sàng xử lý staging sau đó không

### 21.5. Trước khi activate snapshot

- snapshot này có đáng tin hơn snapshot hiện tại không
- nó có đúng scope tôi cần không

### 21.6. Trước khi approve memory

- đây là fact tạm thời hay fact bền
- có evidence đủ mạnh không
- approve nó có làm story cứng sai không

### 21.7. Trước khi apply review

- tôi đang apply phản hồi tốt nhất hay chỉ là phản hồi mới nhất
- quyết định này có kéo theo thay đổi canon không

### 21.8. Trước khi commit map

- tôi có đang commit một cấu trúc mới thật sự tốt hơn không
- thread coverage đã đỡ hơn chưa

### 21.9. Trước khi chuyển story sang published

- public metadata đã ổn chưa
- chapter public đã đúng chưa
- còn lớp staging/draft nào chưa được xử lý không

## 22. Phụ lục nâng cao chi tiết hơn

### 22.1. Khi nào mới nên đụng tới Agents

Chỉ nên vào `Agents` khi:

- team đang tối ưu automation
- output của một agent rõ ràng đang có vấn đề
- cần so canary với active
- cần rollback prompt version

Không nên vào `Agents` để sửa lỗi prose đơn lẻ.

### 22.2. Khi nào mới nên đụng tới Muse

Chỉ nên vào `Muse` khi:

- team dùng Muse như lớp tổng hợp riêng
- cần workspace phân tích/song hành khác với historian analysis

### 22.3. Khi nào mới nên đụng tới operations scope

Chỉ nên dùng chapter-range hoặc rollup khi:

- đang làm vận hành quy mô lớn
- đang nhìn nhiều chapter như một đợt
- đang làm retcon hoặc impact review rộng

### 22.4. Khi nào nên coi lỗi là lỗi hệ thống chứ không phải lỗi nội dung

Dấu hiệu:

- worker tắt
- split lane off
- ready backlog tăng bất thường
- task chạy quá lâu
- retry exhausted
- llama không ready

### 22.5. Khi nào nên coi lỗi là lỗi dữ liệu chứ không phải lỗi hệ thống

Dấu hiệu:

- chapter marker lộn xộn
- delimiter scene không rõ
- canonical source sai
- conflict dày đặc ở cùng một chapter
- review lặp lại cùng một loại lỗi logic

## 23. Kết luận ngắn cho người mới

Nếu chỉ nhớ vài điều:

- bắt đầu từ `Shelf`
- nguồn vào đi qua `Ingest`
- nội dung đi qua `Write`
- độ an toàn đi qua `Analysis`
- lore đi qua `Memory`
- cấu trúc đi qua `Map`
- quyết định của con người đi qua `Reviews`
- lớp public tách riêng khỏi lớp vận hành

Nếu bị rối, hãy luôn tự hỏi:

- tôi đang ở story nào
- tôi đang làm việc ở lớp dữ liệu nào
- thứ tôi đang nhìn là nguồn, bản tạm, bản phân tích, bản đã duyệt hay bản public

Khi trả lời được ba câu đó, bạn thường sẽ biết mình phải bấm ở đâu tiếp theo.

## 24. Ghi chú cuối cùng cho người bàn giao

Nếu dùng tài liệu này để bàn giao cho người khác, hãy nhấn mạnh thêm ba nguyên tắc:

- đừng nhảy thẳng vào `Write` nếu chưa hiểu chapter đang nằm ở lớp dữ liệu nào
- đừng xem `Analysis` như quyết định cuối cùng thay cho con người
- đừng xem `staging` như bản public hoặc bản đã duyệt

Ba nguyên tắc này giải được phần lớn hiểu nhầm ban đầu khi onboarding vào Studio.

Ngoài ra, khi story dài dần lên, hãy tăng tần suất dùng `Analysis`, `Memory` và `Map` trước khi tăng tần suất viết.

Đó là cách giữ hệ thống sạch lâu dài.
