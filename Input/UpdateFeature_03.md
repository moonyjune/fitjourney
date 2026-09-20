### Revised Feature Updates

1. **Add default graph cho các màn hành dashboard**
   Các màn hình show biểu đồ cân nặng, biểu đồ kcalo tiêu thụ, nạp vào hàng ngày lập thành biểu đồ, đưa ra biểu đồ default
   Ở biểu đồ cân nặng, predict đường trending cho các mốc milestone cần thiết.
2. **Đồng bộ data**
   Data được support lưu trữ submit offline (no internet), lưu trữ vào database, và submit đồng bộ lên server khi có internet
3. **Tính lượng kcalo ăn vào, lượng nước tiêu thụ thực tế**
   Khi add proof image, đưa cho AI phân tích giá trị kcalo, lượng ml tiêu thụ thực tế phân tích từ ảnh.
   Cho phép user manually edit kết quả/ record trước khi lưu trữ vào DB.
4. **Tính lượng Kcalo tiêu thụ qua bài tập workout**
   Khi add proof image workout, đưa cho AI phân tích giá trị kcalo tiêu thụ tương ứng.
   Cho phép user manually edit kết quả/ record workout trước khi lữu dữ liệu vào DB.
5. **Format workout lesson**
   Bài tập work out chia lại format hiển thị, từng section hoặc từng bước, ghi số kcalo tiêu thụ, duration.
6. **Workout lesson**
   Workout có button Edit để điều chỉnh nội dung, có support sử dụng AI để finalize nội dung tập luyện.
   Format workout trình bày vẫn được giữ nguyên format sau khi AI generate lại bài tập.
   Các thông tin về step tập, hướng dẫn, số lượng kcalo tiêu thụ, duration đều được fill và có content đầy đủ.
7. **Weekly shopping list**
   Cho phép checkbox tích xem đã chuẩn bị đầy đủ hay chưa. 
   Số lượng, Giá tiền cho phép edit theo giá mua thực tế.
   Thêm button để add/delete custom nguyên liệu/item shopping list.
8. **Water schedule**
   Ghi rõ tại mỗi thời điểm thêm + bao nhiêu ml nước.
   Ở phần progress + water có option +custom số ml nước.
   Ở các thanh bar progress đều chia màu, chưa đạt progress là blue, thấp hơn 50% là red, gần đạt target 70-90% sẽ là mầu yellow. 
   90% trở lên sẽ là màu xanh.
9. **Daily log, weekly summary**
   Bổ sung hiển thị achive log kcalo nạp, kcalo tiêu thụ - work out, water drink thành graph time line theo ngày daily.
   Tổng hợp thành weekly graph ở section Weekly summary
10. **Back-ground color**
   Đối với User Client (Fatty), hiển thị back-ground theo giờ ăn gián đoạn.
   Thời gian được ăn, background color green light
   Thời gian nhịn, background color red light
   Màu back-ground không trùng với bất kỳ màu item component nào của app.
11. **Feeling record**
   Thêm section feeling record, ghi log thời điểm, feeling cảm giác thèm ăn, cơn đói, cảm xúc, tình trạng workout.
   Từ đó làm input để phân tích đưa ra sugguest điều chỉnh hoạt động workout, meal sau mỗi tuần.
12. **Log record**
   Hỗ trợ ghi các log record muộn, không nhất thiết phải real time data.
   Hỗ trợ cho log muộn của tất cả activvities của người
13. **Login**
   Giữ trạng thái login nếu open vào trong 24h. Quá 24h mới yêu cầu login lại.
   Lưu trữ user name, password login.
14. **Update Fixing**
    Điều chỉnh weight chart, start date cố định kể từ ngày start plan hoặc có input cho start date cho 1 kế hoạch max 3 tháng.   
    Start date không đổi cho đến khi move sang kế hoạch mới.
    Today là điểm hiện tại, có vạch đỏ.
    Chuyển 1 week, 2 week, 1month, ... các milestone sẽ đổi range end date và hiển thị prediction result tương ứng.                                                      
    Weekly shoping list là điền price được tham khảo từ giá AI checking. Field editable, nếu xoá đi hiển thị placeholder Actual price paid, người dùng có thể input      
    actual price vào.
    Background màu theo thời gian nhịn, ăn được apply cho tất cả các tab và màn hình, không chỉ tab Home/
15. **Emotional chart**
    Đưa ra Pie chart hoặc chart dạng web để mô tả tracking, analyze về feeling, emotional data.
    Đưa ra nhận định AI tương ứng theo từng update, nhận định mang tính cố vũ, nhận xét thực tế, lạc quan, giúp người dùng tiến tới đích.