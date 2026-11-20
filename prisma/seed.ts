// Sekelas Cafe — realistic seed data.
// Run: bun prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Product image URLs — filled from image-search results (OSS-hosted, stable).
const IMG = {
  kopiSusu: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/20eaedf5ee3b.jpg',
  americano: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/3793fd540162.jpg',
  cappuccino: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b3cce23fde5f.jpg',
  caramelLatte: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/bcd5c0806831.png',
  kopiTubruk: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/6b8b37050c1f.jpg',
  matcha: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2c0680b62a0e.jpg',
  cokelat: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/9782270922d4.jpg',
  thaiTea: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/e8cfe64ba754.jpg',
  redVelvet: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/f88ebc2d0318.jpg',
  lemonTea: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2320fdeff9c2.png',
  lycheeYakult: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/35493d765c3a.jpg',
  rotiBakar: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/1525cf071075.png',
  indomie: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/15da9ca4ce79.jpg',
  pisangGoreng: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b91952112973.jpg',
  kentangGoreng: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/da6a2efb9a03.jpg',
  ayamGeprek: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/c64a0ce376c5.jpg',
}

const TZ = 'Asia/Jakarta'

function bd(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ }).format(d)
}

function at(baseDays: number, hour: number, minute: number): Date {
  // Build a Date at the given Jakarta wall-clock time on day offset baseDays.
  const dateStr = bd(baseDays)
  const guess = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`)
  return guess
}

function clampPast(d: Date, maxAgeMinutes = 5): Date {
  const now = Date.now()
  if (d.getTime() > now - maxAgeMinutes * 60000) {
    return new Date(now - maxAgeMinutes * 60000)
  }
  return d
}

async function main() {
  console.log('Seeding Sekelas Cafe…')

  // ---------- wipe ----------
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.dailyReport.deleteMany(),
    db.dailySequence.deleteMany(),
    db.cashMovement.deleteMany(),
    db.stockCount.deleteMany(),
    db.stockMovement.deleteMany(),
    db.recipeItem.deleteMany(),
    db.stockItem.deleteMany(),
    db.payment.deleteMany(),
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.heldOrder.deleteMany(),
    db.variantOption.deleteMany(),
    db.variantGroup.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.user.deleteMany(),
    db.setting.deleteMany(),
  ])

  // ---------- settings ----------
  await db.setting.create({
    data: {
      key: 'profile',
      value: {
      name: 'Sekelas Cafe',
      tagline: 'Ngopi sekelas, rasa juara — kafe siswa SMKN 1 Boyolangu',
      phone: '0851 5182 3036',
      address: 'Jl. Ki Mangunsarkoro VI/3, Beji, Boyolangu, Tulungagung, Jawa Timur',
      logoUrl: '/logo.png',
      heroImageUrl: 'https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/9eea6f5b5814.jpeg',
      orderCodePrefix: 'SKC',
      } as object,
    },
  })
  await db.setting.create({
    data: {
      key: 'payments',
      value: {
      qrisImageUrl: '/qris-demo.png',
      qrisMerchantName: 'SEKELAS CAFE',
      qrisReminderText:
        'Periksa mutasi di aplikasi merchant sebelum konfirmasi — bukti tangkapan layar bisa dipalsukan.',
      splitEnabled: true,
      } as object,
    },
  })

  // ---------- users ----------
  const passwordHash = await bcrypt.hash('password123', 10)
  const [admin, kasir1, barista1] = await Promise.all([
    db.user.create({
      data: { name: 'Bu Dewi Lestari', username: 'admin', passwordHash, pin: '1234', role: 'ADMIN' },
    }),
    db.user.create({
      data: { name: 'Raka Pratama', username: 'kasir1', passwordHash, pin: '1111', role: 'CASHIER' },
    }),
    db.user.create({
      data: { name: 'Bima Saputra', username: 'barista1', passwordHash, pin: '2222', role: 'BARISTA' },
    }),
  ])
  await db.user.create({
    data: { name: 'Nadia Rahma', username: 'kasir2', passwordHash, pin: '3333', role: 'CASHIER' },
  })
  await db.user.create({
    data: { name: 'Sinta Amelia', username: 'barista2', passwordHash, pin: '4444', role: 'BARISTA' },
  })

  // ---------- categories ----------
  const kopi = await db.category.create({ data: { name: 'Kopi', sortOrder: 1 } })
  const nonKopi = await db.category.create({ data: { name: 'Non-Kopi', sortOrder: 2 } })
  const makanan = await db.category.create({ data: { name: 'Makanan', sortOrder: 3 } })

  // ---------- helper builders ----------
  async function addProduct(opts: {
    name: string
    desc: string
    image: string
    basePrice: number
    categoryId: string
    sortOrder: number
    available?: boolean
    groups?: {
      name: string
      selectionType?: 'SINGLE' | 'MULTI'
      isRequired?: boolean
      minSelect?: number
      maxSelect?: number
      options: { label: string; priceDelta?: number; isDefault?: boolean }[]
    }[]
  }) {
    return db.product.create({
      data: {
        name: opts.name,
        description: opts.desc,
        imageUrl: opts.image || null,
        basePrice: opts.basePrice,
        categoryId: opts.categoryId,
        sortOrder: opts.sortOrder,
        isAvailable: opts.available ?? true,
        variantGroups: {
          create: (opts.groups ?? []).map((g, gi) => ({
            name: g.name,
            selectionType: g.selectionType ?? 'SINGLE',
            isRequired: g.isRequired ?? false,
            minSelect: g.minSelect ?? 0,
            maxSelect: g.maxSelect ?? (g.selectionType === 'MULTI' ? 5 : 1),
            sortOrder: gi,
            options: {
              create: g.options.map((o, oi) => ({
                label: o.label,
                priceDelta: o.priceDelta ?? 0,
                isDefault: o.isDefault ?? false,
                sortOrder: oi,
              })),
            },
          })),
        },
      },
    })
  }

  const UKURAN = (large: number) => ({
    name: 'Ukuran',
    isRequired: true,
    options: [
      { label: 'Reguler', isDefault: true },
      { label: 'Large', priceDelta: large },
    ],
  })
  const SAJIKAN = {
    name: 'Sajikan',
    isRequired: true,
    options: [
      { label: 'Panas' },
      { label: 'Es', isDefault: true },
    ],
  }
  const GULA = {
    name: 'Level Gula',
    isRequired: true,
    options: [
      { label: 'Normal', isDefault: true },
      { label: 'Kurang Manis' },
      { label: 'Tanpa Gula' },
    ],
  }
  const TOPPING = (opts: { label: string; priceDelta: number }[]) => ({
    name: 'Topping',
    selectionType: 'MULTI' as const,
    minSelect: 0,
    maxSelect: 3,
    options: opts,
  })

  // ---------- products: kopi ----------
  const kopiSusu = await addProduct({
    name: 'Es Kopi Susu Sekelas', image: IMG.kopiSusu, basePrice: 10000, categoryId: kopi.id, sortOrder: 1,
    desc: 'Andalan kami — espresso, susu segar, dan gula aren asli Tulungagung.',
    groups: [UKURAN(3000), GULA, TOPPING([{ label: 'Extra Shot', priceDelta: 3000 }, { label: 'Boba', priceDelta: 3000 }, { label: 'Cheese Foam', priceDelta: 4000 }])],
  })
  const americano = await addProduct({
    name: 'Americano', image: IMG.americano, basePrice: 9000, categoryId: kopi.id, sortOrder: 2,
    desc: 'Kopi hitap pekat untuk yang butuh melek extra.',
    groups: [UKURAN(3000), SAJIKAN, TOPPING([{ label: 'Extra Shot', priceDelta: 3000 }])],
  })
  const cappuccino = await addProduct({
    name: 'Cappuccino', image: IMG.cappuccino, basePrice: 14000, categoryId: kopi.id, sortOrder: 3,
    desc: 'Espresso, steam milk, dan foam tebal berlatte art dari barista.',
    groups: [UKURAN(4000), SAJIKAN, TOPPING([{ label: 'Extra Shot', priceDelta: 3000 }, { label: 'Cinnamon Powder', priceDelta: 1000 }])],
  })
  const caramelLatte = await addProduct({
    name: 'Caramel Latte', image: IMG.caramelLatte, basePrice: 16000, categoryId: kopi.id, sortOrder: 4,
    desc: 'Signature caramel gold — latte lembut dengan sirup karamel homemade.',
    groups: [UKURAN(4000), SAJIKAN, TOPPING([{ label: 'Extra Caramel', priceDelta: 2000 }, { label: 'Extra Shot', priceDelta: 3000 }])],
  })
  const kopiTubruk = await addProduct({
    name: 'Kopi Tubruk', image: IMG.kopiTubruk, basePrice: 6000, categoryId: kopi.id, sortOrder: 5,
    desc: 'Cara paling jujur menikmati kopi — ampas ikut nimbrung.',
    groups: [SAJIKAN],
  })

  // ---------- products: non-kopi ----------
  const matcha = await addProduct({
    name: 'Matcha Latte', image: IMG.matcha, basePrice: 15000, categoryId: nonKopi.id, sortOrder: 1,
    desc: 'Matcha premium yang diaduk rata, tidak pahit, tidak bikin nyesel.',
    groups: [UKURAN(4000), SAJIKAN, GULA, TOPPING([{ label: 'Boba', priceDelta: 3000 }])],
  })
  const cokelat = await addProduct({
    name: 'Cokelat Sekelas', image: IMG.cokelat, basePrice: 12000, categoryId: nonKopi.id, sortOrder: 2,
    desc: 'Cokelat kental ala cokelat panas abang-abang, manisnya pas.',
    groups: [UKURAN(3000), SAJIKAN, GULA, TOPPING([{ label: 'Marshmallow', priceDelta: 2000 }])],
  })
  const thaiTea = await addProduct({
    name: 'Thai Tea', image: IMG.thaiTea, basePrice: 11000, categoryId: nonKopi.id, sortOrder: 3,
    desc: 'Teh oranye susu yang juara di hati anak TKJ.',
    groups: [UKURAN(3000), SAJIKAN],
  })
  const redVelvet = await addProduct({
    name: 'Red Velvet Latte', image: IMG.redVelvet, basePrice: 14000, categoryId: nonKopi.id, sortOrder: 4,
    desc: 'Manis, lembut, dan fotogenik — favorit konten story.',
    groups: [UKURAN(4000), SAJIKAN],
  })
  const lemonTea = await addProduct({
    name: 'Lemon Tea', image: IMG.lemonTea, basePrice: 9000, categoryId: nonKopi.id, sortOrder: 5,
    desc: 'Teh melati dingin dengan perasan lemon segar.',
    groups: [SAJIKAN],
  })
  const lycheeYakult = await addProduct({
    name: 'Lychee Yakult', image: IMG.lycheeYakult, basePrice: 16000, categoryId: nonKopi.id, sortOrder: 6,
    desc: 'Segarnya nendang, cocok setelah lapar jam olahraga.',
    groups: [TOPPING([{ label: 'Boba', priceDelta: 3000 }])],
  })
  await addProduct({
    name: 'Air Mineral', image: '', basePrice: 4000, categoryId: nonKopi.id, sortOrder: 7,
    desc: 'Air putih 600ml, dingin.',
  })

  // ---------- products: makanan ----------
  const rotiBakar = await addProduct({
    name: 'Roti Bakar', image: IMG.rotiBakar, basePrice: 9000, categoryId: makanan.id, sortOrder: 1,
    desc: 'Roti bakar mentega dengan topping melimpah.',
    groups: [{
      name: 'Varian', isRequired: true,
      options: [
        { label: 'Cokelat', isDefault: true },
        { label: 'Keju', priceDelta: 2000 },
        { label: 'Cokelat Keju', priceDelta: 4000 },
      ],
    }],
  })
  const indomie = await addProduct({
    name: 'Indomie Kesukaan', image: IMG.indomie, basePrice: 10000, categoryId: makanan.id, sortOrder: 2,
    desc: 'Mitra selamat-ingat semua anak sekolah sejak dulu.',
    groups: [
      { name: 'Kuah', isRequired: true, options: [{ label: 'Goreng', isDefault: true }, { label: 'Kuah' }] },
      { name: 'Level', isRequired: true, options: [{ label: 'Original', isDefault: true }, { label: 'Pedas' }, { label: 'Gila Pedas', priceDelta: 500 }] },
      { name: 'Tambahan', selectionType: 'MULTI' as const, minSelect: 0, maxSelect: 3, options: [
        { label: 'Telur', priceDelta: 3000 }, { label: 'Kornet', priceDelta: 3000 }, { label: 'Mozarella', priceDelta: 4000 },
      ] },
    ],
  })
  const pisangGoreng = await addProduct({
    name: 'Pisang Goreng (5 pcs)', image: IMG.pisangGoreng, basePrice: 8000, categoryId: makanan.id, sortOrder: 3,
    desc: 'Pisang tanduk berbalut tepung renyah, digoreng saat dipesan.',
  })
  const kentangGoreng = await addProduct({
    name: 'Kentang Goreng', image: IMG.kentangGoreng, basePrice: 10000, categoryId: makanan.id, sortOrder: 4,
    desc: 'Kentang potong stick dengan bumbu tabur barbeque.',
    groups: [UKURAN(5000)],
  })
  const ayamGeprek = await addProduct({
    name: 'Nasi Ayam Geprek', image: IMG.ayamGeprek, basePrice: 13000, categoryId: makanan.id, sortOrder: 5,
    desc: 'Ayam krispi digeprek sambal bawang, nangkung nasi hangat.',
    groups: [{
      name: 'Level Sambal', isRequired: true,
      options: [
        { label: 'Level 1 (Santai)', isDefault: true },
        { label: 'Level 3 (Pedas)' },
        { label: 'Level 5 (Berani)' },
      ],
    }],
  })
  await addProduct({
    name: 'Pisang Goreng Keju', image: '', basePrice: 12000, categoryId: makanan.id, sortOrder: 6,
    desc: 'Pisang goreng dengan susu kental manis dan keju parut.',
    available: false, // sold-out demo
  })

  // ---------- stock items ----------
  const mkItem = (sku: string, name: string, unit: string, qty: number, low: number, cost: number) =>
    db.stockItem.create({ data: { sku, name, unit, qty, lowThreshold: low, unitCost: cost } })

  const [beans, susu, garen, sirup, matchapw, cokelatpw, tehCelup, lemon, yakult, cup16, cup22, sedotan, roti, indom, telur, pisang, kentang, ayam] =
    await Promise.all([
      mkItem('BEANS-GAYO', 'Biji Kopi Arabika Gayo', 'gr', 1250, 500, 150),
      mkItem('SUSU-UHT', 'Susu UHT Full Cream', 'ml', 3400, 2000, 18),
      mkItem('GULA-AREN', 'Gula Aren Cair', 'gr', 850, 300, 30),
      mkItem('SIRUP-KARAMEL', 'Sirup Karamel', 'ml', 480, 200, 40),
      mkItem('MATCHA-PW', 'Bubuk Matcha', 'gr', 260, 100, 800),
      mkItem('COKELAT-PW', 'Bubuk Cokelat', 'gr', 620, 200, 350),
      mkItem('TEH-CELUP', 'Teh Celup Melati', 'pcs', 140, 50, 500),
      mkItem('LEMON', 'Lemon Segar', 'pcs', 26, 10, 3000),
      mkItem('YAKULT', 'Yakult', 'pcs', 18, 12, 5500),
      mkItem('CUP-16OZ', 'Cup 16oz + tutup', 'pcs', 230, 100, 900),
      mkItem('CUP-22OZ', 'Cup 22oz + tutup', 'pcs', 88, 100, 1200),
      mkItem('SEDOTAN', 'Sedotan', 'pcs', 310, 100, 150),
      mkItem('ROTI-TAWAR', 'Roti Tawar', 'pcs', 22, 10, 2500),
      mkItem('INDOMIE', 'Indomie Goreng', 'pcs', 40, 12, 3500),
      mkItem('TELUR', 'Telur Ayam', 'pcs', 32, 12, 2500),
      mkItem('PISANG', 'Pisang Tanduk', 'pcs', 38, 15, 2000),
      mkItem('KENTANG', 'Kentang Beku', 'gr', 2400, 1000, 60),
      mkItem('AYAM', 'Ayam Fillet', 'pcs', 24, 10, 9000),
    ])

  // opening restock movements (ledger history)
  const yesterday = bd(-1)
  const twoDaysAgo = bd(-2)
  for (const item of [beans, susu, garen, sirup, matchapw, cokelatpw]) {
    await db.stockMovement.create({
      data: {
        stockItemId: item.id, type: 'RESTOCK_IN', qtyDelta: item.qty, resultingQty: item.qty,
        reason: 'Stok awal pembukaan kafe', userId: admin.id, createdAt: at(-2, 6, 30),
      },
    })
  }

  // ---------- recipes ----------
  const R = (productId: string, lines: { item: typeof beans; qty: number }[]) =>
    db.recipeItem.createMany({
      data: lines.map((l) => ({ productId, stockItemId: l.item.id, qtyPerUnit: l.qty })),
    })
  await R(kopiSusu.id, [{ item: beans, qty: 18 }, { item: susu, qty: 150 }, { item: garen, qty: 20 }, { item: cup16, qty: 1 }, { item: sedotan, qty: 1 }])
  await R(americano.id, [{ item: beans, qty: 15 }, { item: cup16, qty: 1 }])
  await R(cappuccino.id, [{ item: beans, qty: 16 }, { item: susu, qty: 140 }, { item: cup16, qty: 1 }])
  await R(caramelLatte.id, [{ item: beans, qty: 16 }, { item: susu, qty: 150 }, { item: sirup, qty: 20 }, { item: cup16, qty: 1 }])
  await R(kopiTubruk.id, [{ item: beans, qty: 10 }, { item: cup16, qty: 1 }])
  await R(matcha.id, [{ item: matchapw, qty: 8 }, { item: susu, qty: 150 }, { item: cup16, qty: 1 }])
  await R(cokelat.id, [{ item: cokelatpw, qty: 20 }, { item: susu, qty: 150 }, { item: cup16, qty: 1 }])
  await R(lemonTea.id, [{ item: tehCelup, qty: 1 }, { item: lemon, qty: 0.25 }, { item: cup16, qty: 1 }])
  await R(lycheeYakult.id, [{ item: yakult, qty: 1 }, { item: cup16, qty: 1 }])
  await R(rotiBakar.id, [{ item: roti, qty: 2 }])
  await R(indomie.id, [{ item: indom, qty: 1 }, { item: telur, qty: 1 }])
  await R(pisangGoreng.id, [{ item: pisang, qty: 3 }])
  await R(kentangGoreng.id, [{ item: kentang, qty: 150 }])
  await R(ayamGeprek.id, [{ item: ayam, qty: 1 }])

  // ---------- cash + orders ----------
  await db.cashMovement.create({
    data: { businessDate: yesterday, type: 'OPENING_FLOAT', amount: 50000, reason: null, userId: kasir1.id, createdAt: at(-1, 6, 0) },
  })
  await db.cashMovement.create({
    data: { businessDate: yesterday, type: 'CASH_OUT', amount: 20000, reason: 'Beli es batu ke warung sebelah', userId: kasir1.id, createdAt: at(-1, 9, 30) },
  })

  // helper to create seeded orders
  async function seedOrder(opts: {
    code: string
    businessDate: string
    type: 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY'
    status: string
    createdAt: Date
    paidAt?: Date
    preparingAt?: Date
    readyAt?: Date
    completedAt?: Date
    cancelledAt?: Date
    cancelReason?: string
    customerName?: string
    tableLabel?: string
    deliveryLocation?: string
    courierName?: string
    source?: 'POS' | 'PUBLIC'
    discount?: { total: number; reason: string }
    payment?: { method: 'CASH' | 'QRIS'; amount: number; cashReceived?: number; changeDue?: number; qrReference?: string; status?: string }
    items: {
      product: { id: string; name: string; basePrice: number }
      qty: number
      unitPrice: number
      variants: { group: string; label: string; priceDelta: number }[]
      checkedCount?: number
      note?: string
    }[]
  }) {
    const subtotal = opts.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
    const deliveryFee = opts.type === 'DELIVERY' ? 1000 : 0
    const discountTotal = opts.discount?.total ?? 0
    const total = subtotal - discountTotal + deliveryFee
    return db.order.create({
      data: {
        code: opts.code,
        businessDate: opts.businessDate,
        type: opts.type,
        status: opts.status,
        source: opts.source ?? 'POS',
        customerName: opts.customerName ?? null,
        tableLabel: opts.tableLabel ?? null,
        deliveryLocation: opts.deliveryLocation ?? null,
        courierName: opts.courierName ?? null,
        subtotal,
        deliveryFee,
        discountTotal,
        discountReason: opts.discount?.reason ?? null,
        total,
        cashierId: opts.source === 'PUBLIC' ? null : kasir1.id,
        paidAt: opts.paidAt ?? null,
        preparingAt: opts.preparingAt ?? null,
        readyAt: opts.readyAt ?? null,
        completedAt: opts.completedAt ?? null,
        cancelledAt: opts.cancelledAt ?? null,
        cancelReason: opts.cancelReason ?? null,
        createdAt: opts.createdAt,
        items: {
          create: opts.items.map((i) => ({
            productId: i.product.id,
            nameSnapshot: i.product.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
            variantSnapshot: i.variants as never,
            lineTotal: i.unitPrice * i.qty,
            note: i.note ?? null,
            checkedCount: i.checkedCount ?? 0,
          })),
        },
        payments: opts.payment
          ? {
              create: [
                {
                  method: opts.payment.method,
                  amount: opts.payment.amount,
                  cashReceived: opts.payment.cashReceived ?? null,
                  changeDue: opts.payment.changeDue ?? null,
                  qrReference: opts.payment.qrReference ?? null,
                  status: opts.payment.status ?? 'CONFIRMED',
                  verifiedById: opts.payment.status === 'PENDING_VERIFICATION' ? null : kasir1.id,
                  paidAt: opts.paidAt ?? opts.createdAt,
                },
              ],
            }
          : undefined,
      },
    })
  }

  // ----- yesterday: 6 paid completed + 1 cancelled-paid (void demo) -----
  await seedOrder({
    code: 'SKC-001', businessDate: yesterday, type: 'DINE_IN', tableLabel: 'Meja 2',
    status: 'COMPLETED', createdAt: at(-1, 6, 40), paidAt: at(-1, 6, 41), preparingAt: at(-1, 6, 43), readyAt: at(-1, 6, 52), completedAt: at(-1, 6, 58),
    payment: { method: 'CASH', amount: 26000, cashReceived: 30000, changeDue: 4000 },
    items: [
      { product: kopiSusu, qty: 2, unitPrice: 10000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 2 },
      { product: pisangGoreng, qty: 1, unitPrice: 8000, variants: [] },
    ],
  })
  await seedOrder({
    code: 'SKC-002', businessDate: yesterday, type: 'TAKE_AWAY', customerName: 'Kak Fajar',
    status: 'COMPLETED', createdAt: at(-1, 7, 15), paidAt: at(-1, 7, 16), preparingAt: at(-1, 7, 18), readyAt: at(-1, 7, 26), completedAt: at(-1, 7, 30),
    payment: { method: 'QRIS', amount: 30000, qrReference: 'FAJAR/BCA' },
    items: [
      { product: caramelLatte, qty: 1, unitPrice: 20000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 4000 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Topping', label: 'Extra Shot', priceDelta: 3000 }], checkedCount: 1 },
      { product: lemonTea, qty: 1, unitPrice: 9000, variants: [{ group: 'Sajikan', label: 'Es', priceDelta: 0 }], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-003', businessDate: yesterday, type: 'DINE_IN', tableLabel: 'Meja 5',
    status: 'COMPLETED', createdAt: at(-1, 8, 5), paidAt: at(-1, 8, 6), readyAt: at(-1, 8, 22), completedAt: at(-1, 8, 31),
    payment: { method: 'CASH', amount: 51000, cashReceived: 100000, changeDue: 49000 },
    items: [
      { product: indomie, qty: 2, unitPrice: 13000, variants: [{ group: 'Kuah', label: 'Goreng', priceDelta: 0 }, { group: 'Level', label: 'Pedas', priceDelta: 0 }, { group: 'Tambahan', label: 'Telur', priceDelta: 3000 }], checkedCount: 2 },
      { product: thaiTea, qty: 1, unitPrice: 11000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }], checkedCount: 1 },
      { product: kopiTubruk, qty: 1, unitPrice: 6000, variants: [{ group: 'Sajikan', label: 'Panas', priceDelta: 0 }], checkedCount: 1 },
      { product: matcha, qty: 1, unitPrice: 15000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Level Gula', label: 'Kurang Manis', priceDelta: 0 }], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-004', businessDate: yesterday, type: 'DELIVERY', customerName: 'Bu Anita', deliveryLocation: 'Ruang Guru', courierName: 'Bima',
    status: 'COMPLETED', createdAt: at(-1, 9, 20), paidAt: at(-1, 9, 21), readyAt: at(-1, 9, 36), completedAt: at(-1, 9, 48),
    payment: { method: 'QRIS', amount: 43000, qrReference: 'ANITA/BJB' },
    items: [
      { product: cappuccino, qty: 1, unitPrice: 14000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Panas', priceDelta: 0 }], checkedCount: 1 },
      { product: cokelat, qty: 1, unitPrice: 12000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Panas', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 1 },
      { product: kentangGoreng, qty: 1, unitPrice: 10000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-005', businessDate: yesterday, type: 'TAKE_AWAY', customerName: 'Dimas RPL',
    status: 'COMPLETED', createdAt: at(-1, 10, 10), paidAt: at(-1, 10, 11), readyAt: at(-1, 10, 19), completedAt: at(-1, 10, 24),
    discount: { total: 2000, reason: 'Promo jam sepi' },
    payment: { method: 'CASH', amount: 12000, cashReceived: 12000, changeDue: 0 },
    items: [
      { product: ayamGeprek, qty: 1, unitPrice: 13000, variants: [{ group: 'Level Sambal', label: 'Level 3 (Pedas)', priceDelta: 0 }], checkedCount: 1 },
      { product: kopiTubruk, qty: 1, unitPrice: 6000, variants: [{ group: 'Sajikan', label: 'Panas', priceDelta: 0 }], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-006', businessDate: yesterday, type: 'DINE_IN', tableLabel: 'Meja 1',
    status: 'CANCELLED', createdAt: at(-1, 11, 5), paidAt: at(-1, 11, 6), cancelledAt: at(-1, 11, 9),
    cancelReason: 'Salah pesanan — seharusnya yang tanpa gula',
    payment: { method: 'CASH', amount: 10000, cashReceived: 10000, changeDue: 0 },
    items: [
      { product: kopiSusu, qty: 1, unitPrice: 10000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }] },
    ],
  })

  // ----- two days ago: closed Z (history demo) -----
  const twoDaysAgoSnapshot = {
    businessDate: twoDaysAgo,
    gross: 486000, discounts: 5000, voids: 0, net: 482000, cashTotal: 267000, qrisTotal: 215000,
    deliveryFees: 2000, taxTotal: 0, orderCount: 21, itemCount: 38,
    byType: { DINE_IN: { count: 9, revenue: 214000 }, TAKE_AWAY: { count: 10, revenue: 246000 }, DELIVERY: { count: 2, revenue: 22000 } },
    byHour: [{ hour: '06', revenue: 42000, orders: 2 }, { hour: '07', revenue: 128000, orders: 6 }, { hour: '08', revenue: 96000, orders: 4 }, { hour: '09', revenue: 84000, orders: 3 }, { hour: '10', revenue: 72000, orders: 3 }, { hour: '11', revenue: 44000, orders: 2 }, { hour: '12', revenue: 16000, orders: 1 }],
    openingFloat: 50000, cashIn: 0, cashOut: 15000, countedCash: 301000, expectedCash: 302000, variance: -1000,
    merchantQrisTotal: 215000, merchantQrisVariance: 0,
    topProducts: [{ name: 'Es Kopi Susu Sekelas', qty: 11, revenue: 110000 }, { name: 'Indomie Kesukaan', qty: 8, revenue: 104000 }],
    voidsList: [] as unknown[], wasteTotal: 9600,
  }
  await db.dailyReport.create({
    data: { businessDate: twoDaysAgo, kind: 'Z', status: 'CLOSED', snapshot: twoDaysAgoSnapshot as never, generatedById: admin.id, closedAt: at(-2, 14, 5) },
  })
  await db.dailySequence.create({ data: { businessDate: twoDaysAgo, lastNumber: 21 } })
  await db.dailySequence.create({ data: { businessDate: yesterday, lastNumber: 6 } })

  // ----- today: live demo state -----
  const today = bd(0)
  await db.cashMovement.create({
    data: { businessDate: today, type: 'OPENING_FLOAT', amount: 50000, reason: null, userId: kasir1.id, createdAt: clampPast(at(0, 6, 0), 200) },
  })

  await seedOrder({
    code: 'SKC-001', businessDate: today, type: 'TAKE_AWAY', customerName: 'Bagas TKJ',
    status: 'COMPLETED', createdAt: clampPast(at(0, 6, 45), 190), paidAt: clampPast(at(0, 6, 46), 190), readyAt: clampPast(at(0, 6, 58), 180), completedAt: clampPast(at(0, 7, 2), 175),
    payment: { method: 'CASH', amount: 20000, cashReceived: 20000, changeDue: 0 },
    items: [
      { product: kopiSusu, qty: 2, unitPrice: 10000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 2 },
    ],
  })
  await seedOrder({
    code: 'SKC-002', businessDate: today, type: 'DINE_IN', tableLabel: 'Meja 4',
    status: 'COMPLETED', createdAt: clampPast(at(0, 7, 30), 170), paidAt: clampPast(at(0, 7, 31), 170), readyAt: clampPast(at(0, 7, 44), 165), completedAt: clampPast(at(0, 7, 50), 160),
    payment: { method: 'QRIS', amount: 53000, qrReference: 'MEJA4/GOPAY' },
    items: [
      { product: matcha, qty: 1, unitPrice: 19000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 4000 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 1 },
      { product: rotiBakar, qty: 1, unitPrice: 13000, variants: [{ group: 'Varian', label: 'Cokelat Keju', priceDelta: 4000 }], checkedCount: 1 },
      { product: lemonTea, qty: 1, unitPrice: 9000, variants: [{ group: 'Sajikan', label: 'Es', priceDelta: 0 }], checkedCount: 1 },
      { product: pisangGoreng, qty: 1, unitPrice: 8000, variants: [], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-003', businessDate: today, type: 'DINE_IN', tableLabel: 'Meja 2',
    status: 'READY', createdAt: clampPast(at(0, 9, 10), 90), paidAt: clampPast(at(0, 9, 11), 90), preparingAt: clampPast(at(0, 9, 13), 88), readyAt: clampPast(at(0, 9, 25), 80),
    payment: { method: 'CASH', amount: 33000, cashReceived: 50000, changeDue: 17000 },
    items: [
      { product: caramelLatte, qty: 1, unitPrice: 20000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 4000 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Topping', label: 'Extra Caramel', priceDelta: 2000 }], checkedCount: 1 },
      { product: kentangGoreng, qty: 1, unitPrice: 10000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }], checkedCount: 1 },
      { product: kopiTubruk, qty: 1, unitPrice: 6000, variants: [{ group: 'Sajikan', label: 'Panas', priceDelta: 0 }], checkedCount: 1 },
    ],
  })
  await seedOrder({
    code: 'SKC-004', businessDate: today, type: 'TAKE_AWAY', customerName: 'Salsa TKR',
    status: 'PREPARING', createdAt: clampPast(at(0, 10, 40), 40), paidAt: clampPast(at(0, 10, 41), 40), preparingAt: clampPast(at(0, 10, 43), 38),
    payment: { method: 'QRIS', amount: 27000, qrReference: 'SALSA/DANA' },
    items: [
      { product: americano, qty: 1, unitPrice: 12000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 3000 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Topping', label: 'Extra Shot', priceDelta: 3000 }], checkedCount: 1 },
      { product: thaiTea, qty: 1, unitPrice: 11000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }], checkedCount: 0 },
      { product: lycheeYakult, qty: 1, unitPrice: 16000, variants: [], checkedCount: 0 },
    ],
  })
  await seedOrder({
    code: 'SKC-005', businessDate: today, type: 'DELIVERY', customerName: 'Kak Vina', deliveryLocation: 'Lab Komputer',
    status: 'PENDING_PAYMENT', source: 'PUBLIC', createdAt: clampPast(at(0, 11, 5), 10),
    items: [
      { product: kopiSusu, qty: 2, unitPrice: 13000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 3000 }, { group: 'Level Gula', label: 'Kurang Manis', priceDelta: 0 }, { group: 'Topping', label: 'Boba', priceDelta: 3000 }], checkedCount: 0, note: 'bobanya jangan lupa ya kak' },
      { product: indomie, qty: 1, unitPrice: 13000, variants: [{ group: 'Kuah', label: 'Goreng', priceDelta: 0 }, { group: 'Level', label: 'Gila Pedas', priceDelta: 500 }, { group: 'Tambahan', label: 'Telur', priceDelta: 3000 }], checkedCount: 0, note: 'INDOMIE GILA PEDAS + TELUR' },
    ],
  })
  await seedOrder({
    code: 'SKC-006', businessDate: today, type: 'TAKE_AWAY', customerName: 'Rio MM',
    status: 'PENDING_VERIFICATION', source: 'PUBLIC', createdAt: clampPast(at(0, 11, 12), 4),
    payment: { method: 'QRIS', amount: 25000, qrReference: 'RIO/OVO', status: 'PENDING_VERIFICATION' },
    items: [
      { product: cokelat, qty: 1, unitPrice: 12000, variants: [{ group: 'Ukuran', label: 'Reguler', priceDelta: 0 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 0 },
      { product: cokelat, qty: 1, unitPrice: 13000, variants: [{ group: 'Ukuran', label: 'Large', priceDelta: 3000 }, { group: 'Sajikan', label: 'Es', priceDelta: 0 }, { group: 'Level Gula', label: 'Normal', priceDelta: 0 }], checkedCount: 0 },
    ],
  })
  await db.dailySequence.create({ data: { businessDate: today, lastNumber: 6 } })

  // held order demo
  await db.heldOrder.create({
    data: {
      label: 'Meja 3 — Bu Guru',
      itemsSnapshot: [
        { productId: kopiSusu.id, productName: kopiSusu.name, qty: 1, optionIds: [], note: '' },
        { productId: pisangGoreng.id, productName: pisangGoreng.name, qty: 1, optionIds: [], note: '' },
      ] as never,
      metaSnapshot: { type: 'DINE_IN', tableLabel: 'Meja 3' } as never,
      businessDate: today,
      createdById: kasir1.id,
      createdAt: clampPast(at(0, 10, 55), 20),
    },
  })

  // waste movement today (demo in reports + stock ledger)
  await db.stockMovement.create({
    data: { stockItemId: susu.id, type: 'WASTE', qtyDelta: -200, resultingQty: 3400, reason: 'Tumpah saat latte art', userId: barista1.id, createdAt: clampPast(at(0, 9, 30), 60) },
  })

  // audit feed seed
  const feedActions: { action: string; entity: string; label: string; userId: string; at: Date }[] = [
    { action: 'cash.opening_float', entity: 'CashMovement', label: 'Modal awal Rp 50.000', userId: kasir1.id, at: clampPast(at(0, 6, 0), 200) },
    { action: 'order.create', entity: 'Order', label: 'SKC-002 — Rp 53.000 (QRIS)', userId: kasir1.id, at: clampPast(at(0, 7, 30), 170) },
    { action: 'order.status:READY', entity: 'Order', label: 'SKC-003 siap diambil', userId: barista1.id, at: clampPast(at(0, 9, 25), 80) },
    { action: 'stock.waste', entity: 'StockItem', label: 'Susu UHT — tumpah 200 ml', userId: barista1.id, at: clampPast(at(0, 9, 30), 60) },
    { action: 'order.create', entity: 'Order', label: 'SKC-005 — pesanan online Kak Vina', userId: admin.id, at: clampPast(at(0, 11, 5), 10) },
  ]
  for (const f of feedActions) {
    await db.auditLog.create({ data: { userId: f.userId, action: f.action, entity: f.entity, label: f.label, createdAt: f.at } })
  }

  console.log('Seed complete.')
  console.log('Users: admin / kasir1 / kasir2 / barista1 / barista2 — password: password123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
