# Project Rules for `doan`

## 1. Muc tieu
- Code giao dien web bam sat thiet ke Figma/Stitch hoac HTML mau ma user cung cap.
- Uu tien do chinh xac ve bo cuc, khoang cach, mau sac, typography va hanh vi giao dien.
- Khi co rang buoc ve giao dien, khong tu y "lam dep lai" theo y kien ca nhan.

## 2. Nguon su that uu tien
- Figma hoac Stitch la nguon tham chieu giao dien uu tien cao nhat.
- Neu co HTML/CSS mau, phai xem day la baseline can duoc giu on dinh.
- Neu co xung dot giua mo ta va file thiet ke, uu tien xac nhan theo thiet ke hoac hoi lai user.

## 3. Quy tac khi user dua HTML san
- Khong sua CSS, inline style, class name, spacing, color, font, border, shadow neu user khong cho phep.
- Chi sua phan logic nhu:
  - validation
  - submit form
  - toggle UI
  - event handler
  - state
  - render du lieu
  - goi API
- Neu bat buoc phai sua HTML de gan logic, chi duoc them thuoc tinh phuc vu xu ly nhu `id`, `name`, `data-*`, `aria-*` hoac hook JS.
- Khong duoc doi cau truc giao dien neu viec doi cau truc lam thay doi hinh anh hien thi.

## 4. Quy tac khi code tu Figma/Stitch
- Uu tien dung giao dien goc truoc, toi uu hoa sau.
- Responsive phai dua tren frame hoac quy tac ma user cung cap, khong tu suy dien qua xa.
- Asset nhu icon, anh, logo, font phai dung dung file duoc cung cap neu co.
- Hover, focus, active, disabled, error state chi them khi thiet ke co hoac user yeu cau.

## 5. Quy tac xu ly logic
- Logic phai ro rang, tach bach, de test va de bao tri.
- Uu tien cach lam don gian, on dinh, de doc thay vi abstraction qua muc.
- Khong hardcode du lieu neu da co API, config hoac mock data ro rang.
- Kiem tra input truoc khi submit.
- Xu ly trang thai loading, success, error neu co luong gui du lieu.

## 6. Quy tac thay doi code
- Moi thay doi phai toi thieu va dung muc tieu.
- Khong sua nhung phan khong lien quan.
- Khong xoa code cua user neu chua hieu ro tac dung cua no.
- Neu gap code dang mo hoac mo ta chua du, doc code truoc khi sua.

## 7. Quy tac dat ten va cau truc
- Ten bien va ham phai nhat quan, de hieu, phan anh dung nghia.
- Khong tao them file moi neu co the giai quyet gon trong file hien co.
- Neu can them file moi, ten file phai ro muc dich.

## 8. Quy tac lam viec voi user
- Neu user yeu cau "khong sua CSS", xem day la rang buoc cung.
- Neu user yeu cau "chi sua logic", khong mo rong sang refactor giao dien.
- Neu co cho bat buoc phai pha vo rang buoc moi lam duoc, can noi ro ly do truoc.
- Tra loi ngan, truc tiep, tap trung vao ket qua.

## 9. Tieu chi hoan thanh
- Giao dien khong bi lech so voi nguon tham chieu trong pham vi yeu cau.
- Logic chay dung voi case chinh.
- Khong phat sinh thay doi giao dien ngoai y muon.
- Code de doc, de sua, khong them do phuc tap khong can thiet.

## 10. Mac dinh cho project nay
- Nen web.
- Uu tien code sat thiet ke.
- Neu user dua HTML san, mac dinh khong sua CSS.
- Uu tien xu ly logic, wiring su kien va ket noi du lieu truoc cac toi uu khac.
