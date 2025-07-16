import {
  ConversationMessage,
  EventType,
  Message,
  MessageTemplateType,
} from '@asgard-js/core';

const quickReplies = [
  { text: '死侍有上映嗎?' },
  { text: '哪邊可以找得到哺乳室' },
  { text: '請問停車場入場幾分鐘內免費' },
  { text: '可以跨影城進行網路訂票的現場取票嗎' },
  { text: '台中文心秀泰充電樁是新款還是舊款?' },
];

export function createBaseTemplateExample(
  message: Message
): ConversationMessage {
  return {
    type: 'bot',
    messageId: message.messageId,
    isTyping: false,
    typingText: '',
    eventType: EventType.MESSAGE_COMPLETE,
    time: new Date(),
    message,
  };
}

export function createTextTemplateExample(): ConversationMessage {
  const messageId = crypto.randomUUID();

  return createBaseTemplateExample({
    text: '我是秀泰影城 / 生活常見問答 AI，我可以回答你各項關於秀泰商場 / 影城相關的問題，你可以問我任何問題，我會盡力回答你。(目前資料更新至 2024/08)',
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [
        { text: '死侍有上映嗎?' },
        { text: '哪邊可以找得到哺乳室' },
        { text: '請問停車場入場幾分鐘內免費' },
        { text: '可以跨影城進行網路訂票的現場取票嗎' },
        { text: '台中文心秀泰充電樁是新款還是舊款?' },
      ],
    },
    messageId,
    replyToCustomMessageId: '',
    payload: undefined,
    isDebug: false,
    idx: 0,
  });
}

export function createHintTemplateExample(): ConversationMessage {
  const messageId = crypto.randomUUID();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '目前位於: 板橋秀泰',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.HINT,
      text: '目前位於: 板橋秀泰',
      quickReplies,
    },
  });
}

export function createButtonTemplateExample(): ConversationMessage {
  const messageId = crypto.randomUUID();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '目前位於: 板橋秀泰',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.BUTTON,
      title: '死侍與金鋼狼',
      text: '演員: 萊恩·雷諾斯;休·傑克曼;艾瑪·可林;莫蓮娜·芭卡琳;羅伯·德萊尼;萊斯莉·奧加姆斯;卡蘭·索尼;馬修·麥特費狄恩n導演: 薛恩·李維n簡介: 本片是《死侍》系列加入漫威電影宇宙的第一炮，並象徵X戰警正式「回歸」漫威懷抱，死侍與金鋼狼再續睽別15年兄弟情，也被《洛基》影集中的時間變異管理局抓入，一如以往惡搞，他依然嘴賤嗆說漫威救世主非他莫屬，勢在改寫漫威電影宇宙。nn史上最另類超級英雄、語不驚人死不休的死侍睽違六年終於萬眾矚目重返大銀幕，更首度加入漫威電影宇宙！除了與老搭檔鋼人、青少女彈頭和雪緒再度聚首，更將與睽別15年的金鋼狼二度並肩作戰再續兄弟情，時間變異管理局找上門帶走他也老神在在，並自認只有自己能當漫威救世主，改寫漫威電影宇宙。',
      thumbnailImageUrl:
        'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
      imageAspectRatio: 'rectangle',
      imageSize: 'cover',
      imageBackgroundColor: '#FFFFFF',
      buttons: [
        {
          label: '訂票去',
          action: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11502',
          },
        },
        {
          label: '觀看預告片',
          action: {
            type: 'uri',
            uri: 'https://youtu.be/O4PlaF13SH4?si=8DQ-3fZp007s2oJA',
          },
        },
      ],
      defaultAction: {
        type: 'uri',
        uri: 'https://www.showtimes.com.tw/programs/11502',
      },
      quickReplies,
    },
  });
}

export function createCarouselTemplateExample(): ConversationMessage {
  const messageId = crypto.randomUUID();

  return createBaseTemplateExample({
    messageId,
    replyToCustomMessageId: '',
    text: '',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.CAROUSEL,
      quickReplies,
      columns: [
        {
          title: '死侍與金鋼狼',
          text: '演員: 萊恩·雷諾斯;休·傑克曼;艾瑪·可林;莫蓮娜·芭卡琳;羅伯·德萊尼;萊斯莉·奧加姆斯;卡蘭·索尼;馬修·麥特費狄恩n導演: 薛恩·李維n簡介: 本片是《死侍》系列加入漫威電影宇宙的第一炮，並象徵X戰警正式「回歸」漫威懷抱，死侍與金鋼狼再續睽別15年兄弟情，也被《洛基》影集中的時間變異管理局抓入，一如以往惡搞，他依然嘴賤嗆說漫威救世主非他莫屬，勢在改寫漫威電影宇宙。nn史上最另類超級英雄、語不驚人死不休的死侍睽違六年終於萬眾矚目重返大銀幕，更首度加入漫威電影宇宙！除了與老搭檔鋼人、青少女彈頭和雪緒再度聚首，更將與睽別15年的金鋼狼二度並肩作戰再續兄弟情，時間變異管理局找上門帶走他也老神在在，並自認只有自己能當漫威救世主，改寫漫威電影宇宙。',
          thumbnailImageUrl:
            'https://capi.showtimes.com.tw/assets/57/576ed12bedb3ae6e548c6bfa50e9cbb5.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11502',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/O4PlaF13SH4?si=8DQ-3fZp007s2oJA',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11502',
          },
        },
        {
          title: '找死兇宅',
          text: '演員: 李星民;李熙峻;孔升妍;朴智煥;李奎炯;張東周;禹賢;金度勳n導演: 南東協n簡介: 自認為帥哥二人組的宰弼（李星民 飾）和塽邱（李熙峻 飾）搬到某小鎮的第一天，就被崔所長（朴智煥 飾）、南巡警（李奎炯 飾）列為特別監視對象，但宰弼和塽邱光是因為能住在夢想中的歐風建築就感到很幸福。然而，當他們救了掉進水裡的美娜（孔升妍 飾）時，卻被誤認為綁匪。後來，以來尋找美娜的不速之客們為開端，被封印在地下室的惡靈覺醒，黑暗氣息開始籠罩整個家……',
          thumbnailImageUrl:
            'https://upload.wikimedia.org/wikipedia/zh/8/81/HandsomeGuys2024.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',

                uri: 'https://www.showtimes.com.tw/programs/11503',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',

                uri: 'https://youtu.be/YIy0WMtjL2w?si=-MVRM40vj4r_TNN0',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11503',
          },
        },
        {
          title: '鬼才之道',
          text: '演員: 陳柏霖;張榕容;王淨;百白;曾威豪n導演: 徐漢強n簡介: 全新概念的陰間喜劇，《返校》徐漢強執導，由陳柏霖、張榕容、王淨、百白、瘦瘦、姚以緹主演。故事劇情從一間沒落的都市傳說「旺來大飯店」414號房開始，過氣女鬼天后凱薩琳與鬼經紀人Makoto為了在鬼界不被時代淘汰，得找尋出路，力爭上游的厲鬼們，要如何繼續成名陽間，創造新的都市傳說呢？「一個人的才華，有時候要變成鬼才知道。」',
          thumbnailImageUrl:
            'https://capi.showtimes.com.tw/assets/49/49cca24c8625483c83ae8d3016d7a910.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11487',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/a4IMYv34m_o?si=4dS1A8EuXru15nai',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11487',
          },
        },
        {
          title: '人道主義吸血鬼徵求自願獻身者',
          text: '演員: 菲力克斯安端貝納德;莎拉蒙佩蒂n導演: 亞希安路易塞茲n簡介: 出生吸血鬼家族的女孩莎夏，自小就被父母發現她的獠牙發展遲緩、害怕血腥暴力場面，且對作為食物的人類過度富有同理心；長大後，憂心的父母斷絕家中血援，要她向能手表姊學習自力更生。仍然不願野蠻捕殺無辜的她，找到一個折衷方法：混進自殺傾向人士互助會，搜尋生無可戀的對象。她在互助會認識了一個內向憂鬱、在學校遭受霸凌的男孩，兩人一拍即合，男孩相信自己可以死得比活著更有意義，但在奉獻熱血性命之前，莎夏堅持要陪他一一完成死前的願望清單......。nn性格邊緣並有著小眾愛好的少男少女，奇幻迷魅的光影色彩，六〇年代抒情金曲定調全片復古美學，披著暗夜版《去X的世界末日》的外皮，卻有著小清新正能量的故事內核。與旁人格格不入的青春心靈，在遇見彼此後，終於找到了自己。',
          thumbnailImageUrl:
            'https://lh3.googleusercontent.com/proxy/B_50z3tHl8a7Rp772lhqS85vhjcp78kZ44eltd6N9JdN9ZVXvvOyolklvAUewut-M54JYI5OqDws-rWepKDStmOn8P4xCWjjzuQC9aCM7PSZVmjMrDomxlUHg8o',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11514',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/K8aPQtxxzGs?si=UGogSyjvconAb0ko',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11514',
          },
        },
        {
          title: 'DDDD惡魔的破壞 前章',
          text: '演員: 幾田莉拉;ano;入野自由;諏訪部順一;津田健次郎n導演: 黒川智之n簡介: 三年前的8月31日，「侵略者」巨大的母艦突如其來地降臨在東京，地球似乎即將迎來末日 ——。隨著時間流逝，絕望漸漸地融入了日常生活，大大的母艦今天也依然盤旋在天空中。而在還沒有來到世界末日的此刻，小山門出、中川凰蘭這兩個高中女生的青春時代才正要展開。',
          thumbnailImageUrl:
            'https://mediafiles.cinema.com.hk/broadway/cmsimg/cinweb/movie/movie_1718690584.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11506',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/YblRicH4c3s?si=CmupB_QOCyXjt4DE',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11506',
          },
        },
        {
          title: '愛的噩夢',
          text: '演員: 林柏宏;謝欣穎;項婕如n導演: 廖明毅n簡介: 黑澤由里是一個擁有八十萬人追蹤的IG網紅，照片透露著她獨特的生活風格，是女人稱羨男人崇拜的女神級網紅，男子也是追蹤她的八十萬人之一。n男子的女朋友叫白佳琪，他們是在臉書二手書交換社團認識的。白佳琪也很漂亮，對環保又有獨特的愛好，但白佳琪吃全素，又是基督徒，奉行婚前不能性行為的教規，白佳琪的生活可說是規矩很多，她不像一般女生喜歡逛名牌買包包，反而更願意把時間花在她在意的事，比如說⋯去發環保傳單。n如此樸素又純淨的個性讓男子非常喜愛，他們交往一年多之後，白佳琪就建議兩人可以同居，原因是白佳琪有房子，同居可以幫男子省一點房租。n同居第一天，白佳琪卻悶悶不樂，原來白佳琪有自己一套生活習慣，叫做「白佳琪法則」。比如每天回家，白佳琪會檢查男子手機，看他每一則訊息、檢查發票，檢查行蹤是否和定位吻合。或許是熱戀期，男子對白佳琪所有的規定沒有一絲怨言，甚至默默說服自己，為對方付出也是很正常的吧。n直到某天，公司來了客戶拜訪，這名客戶居然是他高中暗戀的女生林艾璇。當天結束後，他倆常常傳訊息，訊息中充滿曖昧語氣。不久之後，艾璇約了男子出去，男子終究不敵內心的渴望，瞞著白佳琪和艾璇出去了。n和白佳琪比起來，跟艾璇的相處自由許多，沒有那麼多規定，想吃什麼就吃什麼，任何小事都很快樂，好像這才是愛情該有的模樣。終於，坦誠的那一天到來。n男子向白佳琪坦白自己有了第三者，吃素的白佳琪在這天晚上煮了牛肉，像是在表示她願意退讓，但對男子來說，這一切已經太晚了。白佳琪哭著說「我可以改呀⋯你不喜歡的我都可以改⋯。」讓男子不忍心傷害白佳琪。n那天夜裡男子做了一個夢，夢裡有個兔子人說可以給男一個願望。男子醒來之後，發現身旁的人變成黑澤由里！他夢寐以求的女神！n願望成真了嗎？還是他還在夢裡？n到底，這會是另一個幸福的開始？還是另一段災難？n還有什麼比控制狂更恐怖的呢？n',
          thumbnailImageUrl:
            'https://taiwancinema.bamid.gov.tw/ImageData/60/2024/92400/t_92400.jpg',
          imageAspectRatio: 'rectangle',
          imageSize: 'cover',
          imageBackgroundColor: '#FFFFFF',
          buttons: [
            {
              label: '訂票去',
              action: {
                type: 'uri',
                uri: 'https://www.showtimes.com.tw/programs/11499',
              },
            },
            {
              label: '觀看預告片',
              action: {
                type: 'uri',
                uri: 'https://youtu.be/V6wpDQ8l6x4?si=NqgHbGnf17393u89',
              },
            },
          ],
          defaultAction: {
            type: 'uri',
            uri: 'https://www.showtimes.com.tw/programs/11499',
          },
        },
      ],
    },
  });
}

export function createChartTemplateExample(): ConversationMessage {
  return createBaseTemplateExample({
    messageId: crypto.randomUUID(),
    replyToCustomMessageId: '',
    text: '這是圖表範例',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      quickReplies: [],
      chartOptions: [
        {
          spec: {
            $schema: 'https://vega.github.io/schema/vega/v5.json',
            description: 'A basic stacked bar chart example.',
            width: 500,
            height: 200,
            padding: 5,
            data: [
              {
                name: 'table',
                values: [
                  { c: '外部廠商', x: '折板機1號線(自動)', y: 3 },
                  { c: '楊*閔', x: '160', y: 28 },
                  { c: '外部廠商', x: '蘿拉沖孔線', y: 2 },
                  { c: '外部廠商', x: '烤二線', y: 17 },
                  { c: '張*麟', x: '160', y: 25 },
                  { c: '蔣*安', x: '160', y: 17 },
                  { c: '楊*閔', x: '歸仁廠區', y: 2 },
                  { c: '外部廠商', x: '190', y: 6 },
                  { c: '外部廠商', x: '三合一多功能線', y: 3 },
                  { c: '楊*閔', x: '三合一多功能線', y: 2 },
                  { c: '烤漆線人員', x: '烤二線', y: 3 },
                  { c: '蔣*安', x: '蘿拉沖孔線', y: 3 },
                  { c: '外部廠商', x: 'D棟沖孔機', y: 2 },
                  { c: '蔣*安', x: '歸仁廠區', y: 3 },
                  { c: '楊*閔', x: '折板機1號線(自動)', y: 2 },
                  { c: '蔣*安', x: '220', y: 23 },
                  { c: '蔣*安', x: '180', y: 20 },
                  { c: '楊*閔', x: '170', y: 9 },
                  { c: '外部廠商', x: '250', y: 6 },
                  { c: '外部廠商', x: '180', y: 14 },
                  { c: '張*麟', x: '190', y: 21 },
                  { c: '複合線人員', x: '190', y: 2 },
                  { c: '楊*閔', x: '蘿拉沖孔線', y: 5 },
                  { c: '張*麟', x: '烤二線', y: 3 },
                  { c: '張*麟', x: '170', y: 14 },
                  { c: '張*麟', x: '220', y: 29 },
                  { c: '蔣*安', x: '烤二線', y: 5 },
                  { c: '楊*閔', x: '250', y: 26 },
                  { c: '楊*閔', x: '烤二線', y: 8 },
                  { c: '外部廠商', x: '170', y: 12 },
                  { c: '蔣*安', x: '190', y: 16 },
                  { c: '外部廠商', x: '五米裁切機', y: 2 },
                  { c: '楊*閔', x: '220', y: 50 },
                  { c: '蔣*安', x: '170', y: 14 },
                  { c: '外部廠商', x: '220', y: 17 },
                  { c: '張*麟', x: '蘿拉沖孔線', y: 2 },
                  { c: '楊*閔', x: '190', y: 19 },
                  { c: '張*麟', x: '250', y: 25 },
                  { c: '張*麟', x: '180', y: 34 },
                  { c: '楊*閔', x: '180', y: 29 },
                  { c: '蔣*安', x: '250', y: 34 },
                  { c: '複合線人員', x: '220', y: 2 },
                  { c: '外部廠商', x: '160', y: 7 },
                ],
                transform: [
                  {
                    type: 'stack',
                    groupby: ['x'],
                    sort: { field: 'c' },
                    field: 'y',
                  },
                ],
              },
            ],
            scales: [
              {
                name: 'x',
                type: 'band',
                range: 'width',
                domain: { data: 'table', field: 'x' },
              },
              {
                name: 'y',
                type: 'linear',
                range: 'height',
                nice: true,
                zero: true,
                domain: { data: 'table', field: 'y1' },
              },
              {
                name: 'color',
                type: 'ordinal',
                range: 'category',
                domain: { data: 'table', field: 'c' },
              },
            ],
            axes: [
              { orient: 'bottom', scale: 'x', zindex: 1 },
              { orient: 'left', scale: 'y', zindex: 1 },
            ],
            marks: [
              {
                type: 'rect',
                from: { data: 'table' },
                encode: {
                  enter: {
                    x: { scale: 'x', field: 'x' },
                    width: { scale: 'x', band: 1, offset: -1 },
                    y: { scale: 'y', field: 'y0' },
                    y2: { scale: 'y', field: 'y1' },
                    fill: { scale: 'color', field: 'c' },
                  },
                  update: { fillOpacity: { value: 1 } },
                  hover: { fillOpacity: { value: 0.5 } },
                },
              },
            ],
          },
          type: '',
          title: '',
        },
      ],
      defaultChart: 'bar',
      text: '好的，這邊已經為您整理出圖表。',
      title: '好的，這邊已經為您整理出圖表。',
      type: MessageTemplateType.CHART,
    },
  });
}

export function createImageTemplateExample(
  width = 400,
  height = 400
): ConversationMessage {
  return createBaseTemplateExample({
    messageId: crypto.randomUUID(),
    replyToCustomMessageId: '',
    text: '這是圖片範例',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.IMAGE,
      originalContentUrl: `https://dummyimage.com/${width}x${height}/000/fff&text=Hello+World`,
      previewImageUrl: `https://dummyimage.com/${width}x${height}/000/fff`,
      quickReplies,
    },
  });
}

export function createMathTemplateExample(): ConversationMessage {
  return createBaseTemplateExample({
    messageId: crypto.randomUUID(),
    replyToCustomMessageId: '',
    text: `# Mathematical Expressions Demo

## Inline Math Examples
- Pythagorean theorem: $a^2 + b^2 = c^2$
- Einstein's mass-energy equivalence: $E = mc^2$
- Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
- Greek letters: $\\alpha + \\beta + \\gamma = \\delta$
- Trigonometry: $\\sin^2(\\theta) + \\cos^2(\\theta) = 1$

## Block Math Examples

### Maxwell's Equations
$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}$$

$$\\nabla \\cdot \\mathbf{B} = 0$$

$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \mathbf{E}}{\partial t}$$

### Matrix Operations
$$\\begin{pmatrix} a & b \\ c & d \\end{pmatrix} \\begin{pmatrix} x \\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\ cx + dy \\end{pmatrix}$$

### Calculus Integration
$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

### Complex Analysis
$$e^{i\\pi} + 1 = 0$$

## Mixed Content with Math

Regular text with **bold** and \`code\`, plus math: $\\sum_{i=1}^{n} x_i = S$.

### Mathematical Lists
1. Linear function: $f(x) = mx + b$
2. Quadratic function: $g(x) = ax^2 + bx + c$  
3. Exponential function: $h(x) = e^{kx}$
4. Logarithmic function: $j(x) = \\log_a(x)$

> **Einstein Quote**: "Mathematics is the language in which God has written the universe." 
> 
> And indeed: $E = mc^2$ changed our understanding of reality!

| Function Type | General Form | Example |
|--------------|-------------|---------|
| Linear | $y = mx + b$ | $y = 2x + 3$ |
| Quadratic | $y = ax^2 + bx + c$ | $y = x^2 - 4x + 4$ |
| Exponential | $y = a \\cdot b^x$ | $y = 2 \\cdot 3^x$ |


This demonstrates the power of **react-markdown** with **KaTeX** integration! 🎉


`,
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.TEXT,
      text: '',
      quickReplies: [
        { text: 'Show physics formulas' },
        { text: 'Display calculus examples' },
        { text: 'Linear algebra demos' },
        { text: 'Statistics formulas' },
      ],
    },
  });
}
