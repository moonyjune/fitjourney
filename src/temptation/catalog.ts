// The Easy level of the temptation challenge: Vietnamese favourites bundled with the app (emoji on a coloured badge, no downloads),
// each with rough figures for one usual serving and a couple of sweet-talking lines. Figures are estimates for the game, not a
// nutrition database.

/** Parts of the day an item fits. `late` is after 21:00 (or before 05:00). */
export type DaySlot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'late';

/** Which boss tempts with it (drawn in TemptBossAvatar). */
export type BossKind = 'sweet' | 'tea' | 'beer' | 'noodle' | 'fried';

export interface CatalogItem {
  id: string;
  vi: string;
  en: string;
  emoji: string;
  /** Badge colour behind the emoji. */
  color: string;
  kcal: number;
  sugarG: number;
  purineMg: number;
  slots: DaySlot[];
  /** More likely on Friday evening and the weekend. */
  weekend?: boolean;
  boss: BossKind;
  pitchVi: string[];
  pitchEn: string[];
}

const item = (
  id: string,
  vi: string,
  en: string,
  emoji: string,
  color: string,
  [kcal, sugarG, purineMg]: [number, number, number],
  slots: DaySlot[],
  boss: BossKind,
  pitchVi: string[],
  pitchEn: string[],
  weekend = false
): CatalogItem => ({ id, vi, en, emoji, color, kcal, sugarG, purineMg, slots, boss, pitchVi, pitchEn, ...(weekend ? { weekend } : {}) });

export const TEMPT_CATALOG: CatalogItem[] = [
  item('milk-tea', 'Trà sữa trân châu đường đen', 'Brown-sugar bubble milk tea', '🧋', '#8B5A3C', [450, 45, 10], ['noon', 'afternoon'], 'tea',
    ['Trân châu dẻo dẻo, đường đen sóng sánh, ly to mát lạnh… chỉ một ống hút thôi mà 😚', 'Size L, 100% đường, thêm kem cheese nha? Hôm nay bạn xứng đáng được nuông chiều mà 💕', 'Hút một hơi là trân châu nảy lên trong miệng, ngọt lịm tới tim luôn đó~'],
    ['Chewy pearls, glossy brown sugar, an icy big cup… just one sip 😚', 'Size L, full sugar, cheese foam on top? You deserve a little treat 💕']),
  item('ca-phe-sua-da', 'Cà phê sữa đá', 'Vietnamese iced milk coffee', '☕', '#6B4226', [150, 20, 5], ['morning', 'afternoon'], 'tea',
    ['Phin nhỏ giọt tí tách, sữa đặc quện đá lạnh… sáng nay mà thiếu ly này là buồn ngủ cả ngày đó nha ☕', 'Đậm, béo, ngọt vừa vừa. Một ly thôi cho tỉnh người, ai nỡ từ chối?'],
    ['Drip, drip, condensed milk swirling over ice… a morning without it is a sleepy morning ☕', 'Strong, creamy, just sweet enough. Just one to wake up, who could say no?']),
  item('bac-xiu', 'Bạc xỉu', 'Bạc xỉu (milky coffee)', '🥛', '#C9A27E', [200, 28, 5], ['morning', 'afternoon'], 'tea',
    ['Nhiều sữa ít cà phê, béo ngậy mềm môi… như một cái ôm buổi sáng vậy đó 🤍', 'Ngọt dịu, mát rượi, uống vào là thấy đời dễ thương hẳn ra~'],
    ['Lots of milk, a little coffee, silky and soft… like a morning hug 🤍', 'Mild, sweet and cool, life gets a bit cuter with every sip~']),
  item('banh-mi', 'Bánh mì thịt nướng', 'Grilled pork bánh mì', '🥖', '#D9A441', [450, 5, 110], ['morning', 'noon'], 'fried',
    ['Vỏ giòn rụm kêu rắc rắc, thịt nướng thơm lừng, pate béo ngậy… nghe tiếng là đói rồi đúng không 😋', 'Thêm trứng, thêm chả, thêm tí ớt nha? Ổ bánh mì nóng hổi đang chờ bạn nè!'],
    ['Crackling crust, smoky grilled pork, rich pâté… hungry already, right? 😋', 'Extra egg, extra chả, a bit of chilli? A hot bánh mì is waiting for you!']),
  item('banh-trang-tron', 'Bánh tráng trộn', 'Rice paper salad', '🌶️', '#E85D3A', [350, 8, 40], ['afternoon', 'late'], 'fried',
    ['Chua chua cay cay, khô bò, trứng cút, sa tế… bịch bánh tráng trộn gọi tên bạn kìa 🌶️', 'Ăn vặt chiều nay một tí thôi, cay xé lưỡi mà vui xé lòng nha~'],
    ['Tangy, spicy, beef jerky, quail eggs, chilli oil… the rice paper bag is calling your name 🌶️', 'Just a little afternoon snack, spicy enough to make you smile~']),
  item('xoi-man', 'Xôi mặn đầy đủ', 'Savoury sticky rice', '🍙', '#E0B04B', [550, 4, 90], ['morning'], 'fried',
    ['Xôi dẻo thơm, lạp xưởng, chà bông, trứng cút, hành phi giòn… gói nóng hổi cầm trên tay luôn nè 🤤', 'Sáng nay ăn xôi cho chắc bụng, cả buổi khỏi đói đâu ha~'],
    ['Fragrant sticky rice, Chinese sausage, pork floss, crispy shallots… steaming in your hands 🤤', 'A sticky-rice breakfast keeps you full all morning~']),
  item('che-thai', 'Chè Thái sầu riêng', 'Thai-style durian dessert', '🍧', '#7BC67E', [400, 50, 10], ['afternoon', 'evening'], 'sweet',
    ['Thạch giòn, mít thơm, nước cốt dừa béo ngậy, thêm múi sầu riêng… mát lạnh từng muỗng 🍧', 'Một ly chè thôi mà, ngọt ngào như mình với bạn vậy đó 💚'],
    ['Crunchy jelly, jackfruit, rich coconut milk and a bit of durian… icy cold, spoon after spoon 🍧', 'Just one cup, sweet like the two of us 💚']),
  item('kem', 'Kem ốc quế sô-cô-la', 'Chocolate ice-cream cone', '🍦', '#F4A3C0', [280, 26, 5], ['afternoon'], 'sweet',
    ['Trời nóng thế này mà có cây kem tan chảy trên đầu lưỡi thì sao? 🍦', 'Vỏ quế giòn, kem sô-cô-la mát lạnh… liếm một cái thôi, hứa đó~'],
    ['In this heat, imagine ice cream melting on your tongue 🍦', 'Crunchy cone, cold chocolate… just one lick, promise~']),
  item('bia', 'Bia lạnh (2 lon)', 'Cold beer (2 cans)', '🍺', '#F2B705', [300, 0, 60], ['evening'], 'beer',
    ['Lon bia đọng sương, nắp bật cái "tách"… cuối tuần rồi, cụng ly với anh em một tí nha 🍻', 'Mát lạnh từ cổ họng xuống tới tim. Một lon thôi, làm gì căng~'],
    ['A frosty can, that "tssk" sound… it\'s the weekend, cheers with the crew 🍻', 'Ice cold all the way down. Just one can, no big deal~'], true),
  item('coca', 'Coca-Cola lạnh', 'Ice-cold cola', '🥤', '#D7263D', [210, 53, 0], ['noon', 'afternoon'], 'sweet',
    ['Bọt ga lăn tăn, đá kêu leng keng… uống cùng bữa trưa thì đúng bài luôn 🥤', 'Một ngụm ga the mát, tỉnh cả người, chỉ một chai nhỏ thôi mà~'],
    ['Fizzing bubbles, clinking ice… made for lunch 🥤', 'One fizzy gulp and you\'re wide awake, just a small bottle~']),
  item('ga-ran', 'Gà rán giòn (2 miếng)', 'Fried chicken (2 pieces)', '🍗', '#E3872D', [600, 0, 180], ['noon', 'evening'], 'fried',
    ['Lớp da giòn tan rôm rốp, thịt bên trong mọng nước… cắn một miếng là nghe "rắc" luôn 🍗', 'Combo gà rán + khoai + nước ngọt đang giảm giá đó, gọi không nè?'],
    ['Shattering crispy skin, juicy inside… one bite and you hear the crunch 🍗', 'Chicken + fries + drink combo, so tempting, right?']),
  item('pizza', 'Pizza phô mai (2 miếng)', 'Cheese pizza (2 slices)', '🍕', '#F28C28', [570, 6, 80], ['evening', 'late'], 'fried',
    ['Phô mai kéo sợi dài thật dài, viền bánh giòn thơm… tối nay xem phim với pizza nha 🍕', 'Nóng hổi vừa ra lò, chỉ hai miếng thôi, ai mà đếm~'],
    ['Cheese stretching forever, a crispy golden crust… pizza and a movie tonight? 🍕', 'Hot from the oven, just two slices, who\'s counting~']),
  item('flan', 'Bánh flan caramel', 'Caramel flan', '🍮', '#E8B04B', [180, 22, 5], ['afternoon', 'evening'], 'sweet',
    ['Mềm mịn rung rinh, caramel đắng nhẹ, thêm đá bào cà phê… tan ngay trên lưỡi 🍮', 'Nhỏ xíu à, một hũ flan thì có sao đâu nè~'],
    ['Silky and wobbly, bittersweet caramel, shaved coffee ice… melts right away 🍮', 'It\'s tiny, one little flan won\'t hurt~']),
  item('mi-cay', 'Mì cay 7 cấp độ', 'Korean spicy noodles', '🍜', '#C0392B', [650, 6, 120], ['evening', 'late'], 'noodle',
    ['Nước dùng đỏ au, hải sản, xúc xích, cay tê đầu lưỡi… trời mưa mà húp tô này thì hết sẩy 🔥', 'Cấp 3 thôi cho ấm bụng nha, cay cay ngọt ngọt mê ly luôn~'],
    ['Fiery red broth, seafood, sausage, tingling spice… perfect on a rainy night 🔥', 'Just level 3 to warm you up, spicy and addictive~']),
  item('khoai-chien', 'Khoai tây chiên lắc phô mai', 'Cheese-shaken fries', '🍟', '#F2C14E', [365, 0, 15], ['afternoon', 'evening'], 'fried',
    ['Nóng giòn, lắc bột phô mai mằn mặn… bốc một cọng là không dừng lại được đâu 🍟', 'Chấm tương cà nha? Một phần nhỏ thôi mà~'],
    ['Hot, crispy, dusted with salty cheese… once you pop you can\'t stop 🍟', 'With ketchup? Just a small portion~']),
  item('tra-dao', 'Trà đào cam sả', 'Peach, orange & lemongrass tea', '🍑', '#F6A04D', [220, 40, 0], ['noon', 'afternoon'], 'tea',
    ['Miếng đào giòn ngọt, thơm mùi sả, mát lạnh sảng khoái… chiều nay giải nhiệt nha 🍑', 'Ly trà đào xinh xỉu, uống vào là thấy mình cũng xinh luôn~'],
    ['Crunchy peach slices, lemongrass, ice cold… cool down this afternoon 🍑', 'Such a pretty drink, you\'ll feel pretty too~']),
  item('sinh-to-bo', 'Sinh tố bơ sữa đặc', 'Avocado smoothie', '🥑', '#6BAA3A', [420, 40, 10], ['afternoon'], 'sweet',
    ['Bơ sáp dẻo quánh, sữa đặc ngọt ngào, xay mịn mát lạnh… béo ngậy mà vẫn "healthy" nè 🥑', 'Một ly xanh mướt, uống bằng muỗng luôn, mê chưa~'],
    ['Buttery avocado, sweet condensed milk, blended icy smooth… creamy yet "healthy" 🥑', 'A green glass so thick you eat it with a spoon~']),
  item('banh-bao', 'Bánh bao xá xíu trứng muối', 'Char-siu bao with salted egg', '🥟', '#F5E6CA', [330, 8, 70], ['morning', 'late'], 'fried',
    ['Bánh bao trắng phau mềm xốp, nhân xá xíu ngọt mặn, trứng muối bùi bùi… còn nóng hổi nè 🥟', 'Bẻ đôi ra là khói bay nghi ngút, thơm ơi là thơm~'],
    ['Fluffy white bun, sweet-savoury char siu, rich salted egg… still steaming 🥟', 'Break it open and the steam curls up, so fragrant~']),
  item('nem-chua-ran', 'Nem chua rán', 'Fried fermented pork rolls', '🍢', '#D35400', [450, 4, 110], ['afternoon', 'evening'], 'fried',
    ['Vỏ chiên vàng giòn, nhân chua chua dai dai, chấm tương ớt… đúng chuẩn ăn vặt Hà Nội 🍢', 'Một đĩa nhỏ thôi, vừa xem phim vừa nhâm nhi nha~'],
    ['Golden crispy shell, tangy chewy filling, chilli sauce… a true Hanoi snack 🍢', 'Just a small plate to nibble with a movie~']),
  item('tra-chanh', 'Trà chanh giã tay', 'Hand-pounded lime tea', '🍋', '#C9D836', [150, 30, 0], ['afternoon'], 'tea',
    ['Chua chua ngọt ngọt, thơm vỏ chanh, ngồi vỉa hè ngắm phố… chill hết nấc 🍋', 'Một ly trà chanh chiều nay, tám chuyện cho vui nè~'],
    ['Sweet and sour, zesty, sipped on the sidewalk… peak chill 🍋', 'A lime tea this afternoon, just to chat~']),
  item('banh-xeo', 'Bánh xèo tôm thịt', 'Crispy bánh xèo', '🥞', '#E9B949', [500, 3, 120], ['evening'], 'fried',
    ['Tiếng "xèo" trên chảo, vỏ vàng giòn, cuốn rau sống chấm nước mắm chua ngọt… nghe thôi là thèm 🥞', 'Mới đổ xong, giòn rụm, ăn liền đi kẻo nguội~'],
    ['That sizzle in the pan, golden crispy edges, wrapped in herbs and dipped in sweet fish sauce 🥞', 'Fresh off the pan, eat it before it gets cold~']),
  item('oc', 'Ốc len xào dừa', 'Snails in coconut milk', '🐌', '#A0522D', [400, 6, 160], ['evening', 'late'], 'beer',
    ['Nước cốt dừa béo thơm, ốc mút cái "chụt", thêm rau răm… tối nay đi ăn ốc không? 🐌', 'Một dĩa ốc với bạn bè, vui hết cỡ luôn~'],
    ['Creamy coconut sauce, slurp-able snails, Vietnamese coriander… snail night? 🐌', 'One plate of snails with friends, the best kind of fun~'], true),
  item('lau-thai', 'Lẩu Thái hải sản', 'Thai seafood hotpot', '🍲', '#E74C3C', [800, 10, 450], ['evening'], 'noodle',
    ['Nồi lẩu chua cay sôi sùng sục, tôm mực nhúng giòn sần sật… cuối tuần quây quần nha 🍲', 'Trời se lạnh mà có nồi lẩu nóng thì còn gì bằng~'],
    ['A bubbling sour-spicy pot, springy shrimp and squid… gather round this weekend 🍲', 'A hot pot on a cool night, nothing better~'], true),
  item('bbq', 'Thịt nướng BBQ', 'Korean BBQ', '🥩', '#B03A2E', [750, 10, 250], ['evening'], 'beer',
    ['Thịt ba chỉ xèo xèo trên vỉ, mỡ chảy óng ánh, cuốn rau chấm sốt… thơm nức mũi 🥩', 'Buffet nướng tối nay, ăn bao nhiêu tùy thích đó~'],
    ['Pork belly sizzling on the grill, glistening, wrapped with sauce… smells amazing 🥩', 'BBQ buffet tonight, all you can eat~'], true),
  item('banh-trang-nuong', 'Bánh tráng nướng', 'Grilled rice paper "pizza"', '🫓', '#E67E22', [300, 3, 50], ['late', 'afternoon'], 'fried',
    ['Nướng trên than hồng, trứng, xúc xích, phô mai, tương ớt… giòn tan trong gió đêm 🫓', 'Pizza Đà Lạt nè, một cái thôi cho ấm bụng~'],
    ['Grilled over charcoal with egg, sausage, cheese and chilli… crispy in the night air 🫓', 'Đà Lạt pizza, just one to warm up~']),
  item('hot-vit-lon', 'Hột vịt lộn rau răm', 'Balut with herbs', '🥚', '#BFA27A', [180, 1, 120], ['evening', 'late'], 'beer',
    ['Húp nước ngọt lịm, chấm muối tiêu chanh, thêm rau răm… tối nay hai hột nha 🥚', 'Nóng hổi vừa luộc xong, bổ dưỡng mà ngon dã man~'],
    ['Sip the broth, dip in salt-pepper-lime, add herbs… two tonight? 🥚', 'Freshly boiled, hot and oh so good~']),
  item('pho', 'Phở bò tái nạm', 'Beef phở', '🍜', '#C68642', [500, 4, 200], ['morning', 'late'], 'noodle',
    ['Nước dùng trong veo ninh xương cả đêm, thịt tái hồng hồng, quẩy giòn chấm vào… 🍜', 'Thêm chén nước béo, thêm quẩy nha? Sáng nay húp phở cho ấm lòng~'],
    ['Clear broth simmered all night, pink rare beef, crispy quẩy dipped in… 🍜', 'Extra fatty broth, extra quẩy? A warm phở morning~']),
  item('bun-bo', 'Bún bò Huế giò heo', 'Bún bò Huế', '🍜', '#B9472E', [550, 4, 230], ['morning'], 'noodle',
    ['Nước lèo cay nồng thơm sả, giò heo mềm, chả cua… sáng nay làm một tô cho đã 🌶️', 'Vắt chanh, thêm sa tế, húp xì xụp là hết buồn ngủ~'],
    ['Spicy lemongrass broth, tender pork hock, crab cake… a big bowl this morning 🌶️', 'Squeeze of lime, chilli oil, slurp, and you\'re awake~']),
  item('com-tam', 'Cơm tấm sườn bì chả', 'Broken rice with pork chop', '🍛', '#D4883E', [750, 8, 180], ['morning', 'noon'], 'fried',
    ['Sườn nướng than thơm lừng, mỡ hành óng ánh, chả trứng, bì… đĩa cơm tấm chuẩn Sài Gòn 🍛', 'Thêm trứng ốp la lòng đào nha? Rưới nước mắm ngọt là hết ý~'],
    ['Charcoal pork chop, scallion oil, egg meatloaf, shredded pork skin… Saigon style 🍛', 'Add a runny fried egg? Drizzle the sweet fish sauce~']),
  item('banh-kem', 'Bánh kem sô-cô-la', 'Chocolate cake', '🍰', '#6D3B2A', [400, 35, 10], ['afternoon', 'evening'], 'sweet',
    ['Cốt bánh ẩm mềm, sô-cô-la chảy óng ánh… một lát nhỏ thôi cho ngọt ngào ngày dài 🍰', 'Ai đó mới mua bánh kem về, phần bạn một miếng nè 💝'],
    ['Moist sponge, glossy melting chocolate… just a thin slice to sweeten the day 🍰', 'Someone brought cake, here\'s a piece for you 💝']),
  item('donut', 'Donut phủ đường', 'Glazed doughnut', '🍩', '#F7A1C4', [300, 18, 5], ['morning', 'afternoon'], 'sweet',
    ['Mềm xốp, lớp đường óng ánh tan trong miệng, rắc cốm bảy màu… xinh quá trời 🍩', 'Một cái với ly cà phê thì đúng bài luôn~'],
    ['Soft and fluffy, a glossy glaze melting in your mouth, rainbow sprinkles 🍩', 'One with your coffee, perfect pairing~']),
  item('matcha-da-xay', 'Matcha đá xay kem tươi', 'Matcha frappé with cream', '🍵', '#88B04B', [450, 55, 5], ['afternoon'], 'tea',
    ['Xanh mướt, mát rượi, kem tươi bồng bềnh trên đỉnh… chụp hình sống ảo xong uống liền nè 🍵', 'Trà xanh mà, "healthy" chút xíu đó~'],
    ['Bright green, icy, a cloud of cream on top… snap a photo then sip 🍵', 'It\'s green tea, practically healthy~']),
  item('sua-chua-tran-chau', 'Sữa chua trân châu', 'Yogurt with tapioca pearls', '🍨', '#F3E5AB', [300, 35, 5], ['afternoon'], 'sweet',
    ['Chua chua ngọt ngọt, trân châu dai dai, mát lạnh… chiều nay ăn cho vui miệng 🍨', 'Sữa chua tốt cho tiêu hoá mà, ăn một hũ thôi nha~'],
    ['Tangy and sweet with chewy pearls, ice cold… a fun afternoon bite 🍨', 'Yogurt is good for you, just one cup~']),
  item('socola', 'Thanh sô-cô-la sữa', 'Milk chocolate bar', '🍫', '#7B3F00', [250, 25, 10], ['afternoon', 'late'], 'sweet',
    ['Bẻ một miếng nghe "tách", để tan từ từ trên lưỡi… ngọt ngào như lời mình nói vậy 🍫', 'Một ô thôi, rồi thêm một ô nữa… hihi~'],
    ['Snap a square and let it melt slowly… as sweet as my words 🍫', 'Just one square, then another… hehe~']),
  item('snack', 'Snack khoai tây vị phô mai', 'Cheese potato chips', '🥔', '#F4D03F', [270, 1, 10], ['late', 'afternoon'], 'fried',
    ['Bóc gói nghe "xoẹt", giòn rụm từng lát… xem phim khuya mà thiếu snack là không trọn vẹn 🥔', 'Gói nhỏ thôi, ăn hết lúc nào không hay luôn~'],
    ['Rip the bag, crunchy slice after slice… a late movie needs snacks 🥔', 'Just a small bag, gone before you notice~']),
  item('chao-long', 'Cháo lòng', 'Pork offal rice porridge', '🥣', '#B08D57', [450, 2, 350], ['late', 'morning'], 'noodle',
    ['Cháo sánh mịn, lòng dồi giòn sần sật, quẩy nóng… đêm khuya làm một tô ấm bụng 🥣', 'Rắc tiêu, thêm hành phi, húp từng muỗng nóng hổi~'],
    ['Silky porridge, crunchy blood sausage, hot quẩy… a warm late-night bowl 🥣', 'Black pepper, crispy shallots, spoonful after hot spoonful~']),
  item('burger', 'Hamburger bò phô mai', 'Cheeseburger', '🍔', '#C0392B', [550, 9, 120], ['noon', 'evening'], 'fried',
    ['Bò nướng mọng nước, phô mai chảy, bánh mì mềm… cắn một miếng to thật to nha 🍔', 'Combo burger hôm nay nhìn mê quá, gọi một phần không?'],
    ['Juicy patty, melting cheese, soft bun… take one huge bite 🍔', 'Today\'s burger combo looks amazing, want one?']),
  item('mi-tom-dem', 'Mì tôm trứng đêm khuya', 'Late-night instant noodles with egg', '🍜', '#F1C40F', [450, 3, 60], ['late'], 'noodle',
    ['Nửa đêm rồi, bụng kêu ọt ọt… gói mì tôm đập thêm quả trứng, thơm điếc mũi luôn 🌙', 'Có 5 phút thôi mà, nấu nhanh ăn liền, ai biết đâu~'],
    ['It\'s midnight and your tummy rumbles… instant noodles with an egg, smells unreal 🌙', 'Only 5 minutes, nobody has to know~']),
  item('vang-do', 'Ly vang đỏ', 'Glass of red wine', '🍷', '#7B1E3A', [125, 1, 5], ['evening'], 'beer',
    ['Ánh nến lung linh, ly vang sóng sánh… tối thứ bảy thư giãn chút nha 🍷', 'Chỉ một ly nhỏ cho đêm thêm lãng mạn thôi~'],
    ['Candlelight, wine swirling in the glass… relax a little this Saturday 🍷', 'Just one small glass for a romantic night~'], true),
  item('nuoc-mia', 'Nước mía tắc', 'Sugarcane juice with kumquat', '🥤', '#A8D86E', [250, 55, 0], ['noon', 'afternoon'], 'tea',
    ['Mía ép tươi ngọt mát, thêm tắc chua chua, đá đầy ly… giải khát giữa trưa nắng 🌞', 'Đồ uống thiên nhiên mà, một ly thôi nha~'],
    ['Fresh-pressed cane juice with a squeeze of kumquat, lots of ice 🌞', 'It\'s all natural, just one glass~']),
  item('ca-vien-chien', 'Cá viên chiên', 'Fried fish balls', '🍡', '#E59866', [300, 4, 90], ['afternoon', 'late'], 'fried',
    ['Xiên que nóng hổi, chấm tương ngọt tương ớt… món tuổi thơ đang gọi bạn đó 🍡', 'Một xiên thôi, mỗi loại một viên cho biết~'],
    ['Hot skewers dipped in sweet and chilli sauce… a childhood snack is calling 🍡', 'Just one skewer, one of each~']),
  item('banh-tieu', 'Bánh tiêu + sữa đậu nành', 'Sesame doughnut with soy milk', '🥯', '#D4AC6E', [320, 18, 30], ['morning', 'afternoon'], 'sweet',
    ['Bánh tiêu phồng giòn rắc mè, chấm sữa đậu nành nóng… sáng nay đơn giản mà ngon 🥯', 'Mè thơm, vỏ giòn, ruột rỗng ngọt nhẹ, ăn một cái thôi~'],
    ['Puffy sesame doughnut dunked in hot soy milk… simple and so good 🥯', 'Crispy, sesame-scented, lightly sweet, just one~']),
];

/** The slot of an hour (0-23). */
export function slotOfHour(hour: number): DaySlot {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'late';
}

/** Friday from 17:00, Saturday and Sunday. */
export function isWeekendMood(now: Date): boolean {
  const day = now.getDay();
  return day === 0 || day === 6 || (day === 5 && now.getHours() >= 17);
}

/** One lead-in line for the time of day, to put before an item's pitch. */
export const OPENERS: Record<DaySlot | 'weekend', { vi: string[]; en: string[] }> = {
  morning: { vi: ['Chào buổi sáng nè ☀️', 'Sáng sớm bụng đói meo rồi đúng không?'], en: ['Good morning ☀️', 'Empty tummy this morning, right?'] },
  noon: { vi: ['Trưa rồi, nghỉ tay chút đi~', 'Giờ ăn trưa tới rồi nè 🕛'], en: ['It\'s noon, take a break~', 'Lunchtime is here 🕛'] },
  afternoon: { vi: ['Chiều nay hơi uể oải ha?', 'Ba giờ chiều, giờ của ăn vặt 😏'], en: ['Feeling sluggish this afternoon?', '3 pm, snack o\'clock 😏'] },
  evening: { vi: ['Tối rồi, xả hơi chút đi~', 'Một ngày dài rồi, thưởng cho mình nha 🌆'], en: ['Evening now, unwind a little~', 'Long day, treat yourself 🌆'] },
  late: { vi: ['Khuya rồi mà vẫn còn thức à? 🌙', 'Đêm nay dài lắm đó…'], en: ['Still up this late? 🌙', 'It\'s going to be a long night…'] },
  weekend: { vi: ['Cuối tuần rồi đó nha 🎉', 'Weekend mà, xả láng chút đi~'], en: ['It\'s the weekend 🎉', 'Weekend vibes, let loose a bit~'] },
};
